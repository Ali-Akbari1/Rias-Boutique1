import {
  getHeader,
  parseJsonBody,
  readRawBody,
  sendError,
  type ApiRequest,
  type ApiResponse,
} from "../server/lib/http.js";
import { checkRateLimit, applyRateLimitHeaders } from "../server/lib/rate-limit.js";
import {
  getClientIp,
  verifyWebhookSignature,
  verifyWebhookTimestamp,
  validateOrigin,
  buildAllowedOrigins,
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

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const allowedOrigins = buildAllowedOrigins(
    process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "",
    process.env.ALLOWED_WEBHOOK_ORIGINS?.trim() || "",
  );
  if (!validateOrigin(req, allowedOrigins)) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This webhook origin is not allowed.");
    return;
  }

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

  const rawBody = await readRawBody(req);
  if (!rawBody.trim()) {
    sendError(res, 400, "INVALID_PAYLOAD", "Webhook payload is empty.");
    return;
  }

  const webhookSecret = process.env.CLOVER_WEBHOOK_SECRET?.trim() || "";
  if (!webhookSecret) {
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
  const timestampHeader =
    getHeader(req, "x-clover-timestamp") || getHeader(req, "clover-timestamp") || getHeader(req, "x-timestamp") || "";

  const signatureValid = verifyWebhookSignature({
    rawBody,
    signatureHeader,
    timestampHeader,
    secret: webhookSecret,
  });
  if (!signatureValid) {
    sendError(res, 401, "INVALID_SIGNATURE", "Webhook signature verification failed.");
    return;
  }

  if (
    timestampHeader &&
    !verifyWebhookTimestamp(timestampHeader, Number(process.env.CLOVER_WEBHOOK_TOLERANCE_MS || DEFAULT_TIMESTAMP_TOLERANCE_MS))
  ) {
    sendError(res, 401, "STALE_WEBHOOK", "Webhook timestamp is outside the allowed window.");
    return;
  }

  const payload = parseJsonBody<unknown>(rawBody);
  if (!payload) {
    sendError(res, 400, "INVALID_JSON", "Webhook payload is not valid JSON.");
    return;
  }

  const parsed = parseCloverWebhook(payload, rawBody);
  const order = parsed.orderId ? await findOrderById(parsed.orderId) : await findOrderByCheckoutId(parsed.checkoutId);
  if (!order) {
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
      const updatedOrder = await markOrderPaidAndDecrementInventory({
        orderId: order.id,
        paymentReference: parsed.paymentReference || parsed.checkoutId || parsed.eventId,
      });

      if (!updatedOrder.confirmationEmailSentAt) {
        await sendOrderConfirmationEmail(updatedOrder);
        await markConfirmationEmailSent(updatedOrder.id);
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
    res.status(200).json({
      received: true,
      processed: true,
      eventId: parsed.eventId,
      orderId: order.id,
    });
  } catch (error) {
    sendError(
      res,
      500,
      "WEBHOOK_PROCESSING_FAILED",
      error instanceof Error ? error.message : "Webhook processing failed.",
    );
  }
}
