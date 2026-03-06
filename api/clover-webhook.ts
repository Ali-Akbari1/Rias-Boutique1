import {
  createDeterministicHash,
  getHeader,
  parseJsonBody,
  readRawBody,
  readRawBodyFromStream,
  sendError,
  type ApiRequest,
  type ApiResponse,
} from "../server/lib/http.js";
import { checkRateLimit, applyRateLimitHeaders } from "../server/lib/rate-limit.js";
import {
  getClientIp,
  resolveWebhookTimestamp,
  verifyWebhookSignatureDetailed,
  verifyWebhookTimestamp,
} from "../server/lib/security.js";
import { parseCloverWebhook } from "../server/lib/clover-webhook.js";
import {
  findOrderByCheckoutId,
  findOrderById,
  isOrderStoreConfigured,
  markConfirmationEmailSent,
  markOrderFailed,
  markOrderPaidAndDecrementInventory,
  markWebhookProcessed,
  upsertWebhookEvent,
} from "../server/lib/order-store.js";
import { sendOrderConfirmationEmail } from "../server/lib/email.js";
import { ensureShipmentForOrder } from "../server/lib/order-fulfillment.js";

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const isDebugLoggingEnabled = () => process.env.CLOVER_DEBUG_LOGS?.trim().toLowerCase() === "true";
const createRequestId = () => createDeterministicHash(`${Date.now()}|${Math.random()}`).slice(0, 12);
const safeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const config = {
  api: {
    bodyParser: false,
  },
};

const getWebhookSecrets = () => {
  const rawValues = [
    process.env.CLOVER_WEBHOOK_SECRET || "",
    process.env.CLOVER_WEBHOOK_SECRETS || "",
    process.env.CLOVER_WEBHOOK_SECRET_SANDBOX || "",
    process.env.CLOVER_WEBHOOK_SECRET_PRODUCTION || "",
  ];

  return [...new Set(rawValues.flatMap((value) => value.split(",").map((part) => part.trim()).filter(Boolean)))];
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }
  const requestId = createRequestId();
  const debugLogs = isDebugLoggingEnabled();
  res.setHeader("X-Request-Id", requestId);

  const rateResult = checkRateLimit({
    key: `webhook:${getClientIp(req)}`,
    limit: Number(process.env.WEBHOOK_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.WEBHOOK_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many webhook requests.");
    return;
  }

  // For signature verification we must hash the exact raw stream bytes.
  // Fallback to generic body reader only in non-stream test environments.
  const streamBody = await readRawBodyFromStream(req);
  const rawBody = streamBody || (await readRawBody(req));
  const rawBodyHash = createDeterministicHash(rawBody).slice(0, 16);
  if (!rawBody.trim()) {
    sendError(res, 400, "INVALID_PAYLOAD", "Webhook payload is empty.");
    return;
  }

  const webhookSecrets = getWebhookSecrets();
  if (webhookSecrets.length === 0) {
    sendError(res, 500, "WEBHOOK_NOT_CONFIGURED", "Webhook secret is not configured on the server.");
    return;
  }

  if (!isOrderStoreConfigured()) {
    sendError(res, 500, "WEBHOOK_NOT_CONFIGURED", "Supabase order store is not configured on the server.");
    return;
  }

  const signatureHeader =
    getHeader(req, "x-clover-signature") ||
    getHeader(req, "clover-signature") ||
    getHeader(req, "x-webhook-signature") ||
    "";
  const rawTimestampHeader =
    getHeader(req, "x-clover-timestamp") || getHeader(req, "clover-timestamp") || getHeader(req, "x-timestamp") || "";
  const timestampHeader = resolveWebhookTimestamp(signatureHeader, rawTimestampHeader);

  const signatureCheck = verifyWebhookSignatureDetailed({
    rawBody,
    signatureHeader,
    timestampHeader,
    secret: webhookSecrets,
  });
  if (debugLogs) {
    console.log("[clover-webhook] received", {
      requestId,
      bodyLength: rawBody.length,
      bodyHash: rawBodyHash,
      hasSignatureHeader: Boolean(signatureHeader),
      hasTimestampHeader: Boolean(timestampHeader),
      signatureHeaderSample: signatureHeader.slice(0, 120),
      timestampHeaderSample: timestampHeader.slice(0, 32),
      signatureCheckReason: signatureCheck.reason,
      contentType: getHeader(req, "content-type") || "",
      userAgent: getHeader(req, "user-agent") || "",
    });
  }
  if (!signatureCheck.valid) {
    console.error("[clover-webhook] signature verification failed", {
      requestId,
      bodyLength: rawBody.length,
      bodyHash: rawBodyHash,
      hasSignatureHeader: Boolean(signatureHeader),
      hasTimestampHeader: Boolean(timestampHeader),
      signatureHeaderSample: signatureHeader.slice(0, 120),
      signatureParts: signatureHeader
        .split(",")
        .map((part) => part.trim().split("=")[0] || "raw")
        .filter(Boolean),
      timestampHeaderSample: timestampHeader.slice(0, 32),
      configuredSecretCount: webhookSecrets.length,
      signatureDiagnostics: signatureCheck,
    });
    sendError(res, 401, "INVALID_SIGNATURE", "Webhook signature verification failed.");
    return;
  }

  if (
    timestampHeader &&
    !verifyWebhookTimestamp(timestampHeader, Number(process.env.CLOVER_WEBHOOK_TOLERANCE_MS || DEFAULT_TIMESTAMP_TOLERANCE_MS))
  ) {
    console.error("[clover-webhook] timestamp verification failed", {
      requestId,
      timestampHeader,
      toleranceMs: Number(process.env.CLOVER_WEBHOOK_TOLERANCE_MS || DEFAULT_TIMESTAMP_TOLERANCE_MS),
      bodyHash: rawBodyHash,
    });
    sendError(res, 401, "STALE_WEBHOOK", "Webhook timestamp is outside the allowed window.");
    return;
  }

  const payload = parseJsonBody<unknown>(rawBody);
  if (!payload) {
    sendError(res, 400, "INVALID_JSON", "Webhook payload is not valid JSON.");
    return;
  }

  const parsed = parseCloverWebhook(payload, rawBody);
  console.log("[clover-webhook] parsed payload", {
    requestId,
    bodyHash: rawBodyHash,
    eventId: parsed.eventId,
    eventType: parsed.eventType,
    orderId: parsed.orderId,
    checkoutId: parsed.checkoutId,
    isPaidEvent: parsed.isPaidEvent,
  });
  const order = parsed.orderId ? await findOrderById(parsed.orderId) : await findOrderByCheckoutId(parsed.checkoutId);
  if (!order) {
    console.warn("[clover-webhook] order not found for parsed payload", {
      requestId,
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      parsedOrderId: parsed.orderId,
      parsedCheckoutId: parsed.checkoutId,
    });
    // Ack unknown events to avoid provider retry storms.
    res.status(202).json({
      received: true,
      processed: false,
      reason: "Order not found for webhook payload.",
      eventId: parsed.eventId,
    });
    return;
  }

  const inserted = await upsertWebhookEvent({
    eventId: parsed.eventId,
    eventType: parsed.eventType,
    orderId: order.id,
    payloadJson: rawBody,
  });
  if (!inserted) {
    if (debugLogs) {
      console.log("[clover-webhook] duplicate event ignored", {
        requestId,
        eventId: parsed.eventId,
        orderId: order.id,
      });
    }
    res.status(200).json({
      received: true,
      processed: false,
      duplicate: true,
      eventId: parsed.eventId,
    });
    return;
  }

  try {
    if (parsed.isPaidEvent) {
      let updatedOrder = await markOrderPaidAndDecrementInventory({
        orderId: order.id,
        paymentReference: parsed.paymentReference || parsed.checkoutId || parsed.eventId,
      });

      if (updatedOrder.customer.deliveryMethod === "shipping" && !updatedOrder.shipment) {
        try {
          updatedOrder = await ensureShipmentForOrder(updatedOrder);
        } catch (shipmentError) {
          console.error("[clover-webhook] shipment purchase failed", {
            requestId,
            orderId: updatedOrder.id,
            eventId: parsed.eventId,
            error: safeErrorMessage(shipmentError),
          });
        }
      }

      if (!updatedOrder.confirmationEmailSentAt) {
        try {
          await sendOrderConfirmationEmail(updatedOrder);
          await markConfirmationEmailSent(updatedOrder.id);
        } catch (emailError) {
          console.error("[clover-webhook] confirmation email failed", {
            requestId,
            orderId: updatedOrder.id,
            eventId: parsed.eventId,
            error: safeErrorMessage(emailError),
          });
        }
      }
    } else if (parsed.eventType.includes("fail") || parsed.eventType.includes("cancel")) {
      await markOrderFailed({
        orderId: order.id,
        errorMessage: parsed.eventType.includes("cancel")
          ? "Checkout was canceled before payment confirmation."
          : "Payment failed before confirmation.",
      });
    }

    await markWebhookProcessed(parsed.eventId);
    console.log("[clover-webhook] processed", {
      requestId,
      eventId: parsed.eventId,
      orderId: order.id,
      eventType: parsed.eventType,
      isPaidEvent: parsed.isPaidEvent,
    });
    res.status(200).json({
      received: true,
      processed: true,
      eventId: parsed.eventId,
      orderId: order.id,
    });
  } catch (error) {
    console.error("[clover-webhook] processing failed", {
      requestId,
      eventId: parsed.eventId,
      orderId: order.id,
      error: safeErrorMessage(error),
    });
    sendError(
      res,
      500,
      "WEBHOOK_PROCESSING_FAILED",
      error instanceof Error ? error.message : "Webhook processing failed.",
    );
  }
}
