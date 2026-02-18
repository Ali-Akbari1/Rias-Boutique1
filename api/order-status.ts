import {
  findOrderByCheckoutId,
  findOrderById,
  isOrderStoreConfigured,
  markConfirmationEmailSent,
  markOrderPaidAndDecrementInventory,
} from "../server/lib/order-store.js";
import { createDeterministicHash, getQueryValue, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import { buildAllowedOrigins, getClientIp, validateOrigin } from "../server/lib/security.js";
import { CloverApiError, fetchCloverCheckoutStatus } from "../server/lib/clover.js";
import { sendOrderConfirmationEmail } from "../server/lib/email.js";

const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_CLOVER_API_BASE_URL = "https://apisandbox.dev.clover.com";
const PROD_CLOVER_API_BASE_URL = "https://api.clover.com";
const isDebugLoggingEnabled = () => process.env.CLOVER_DEBUG_LOGS?.trim().toLowerCase() === "true";
const createRequestId = () => createDeterministicHash(`${Date.now()}|${Math.random()}`).slice(0, 12);
const safeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const getCloverApiBaseCandidates = (configuredBaseUrl: string) => {
  const normalized = (configuredBaseUrl || DEFAULT_CLOVER_API_BASE_URL).replace(/\/+$/, "");
  const candidates = [normalized];

  if (normalized !== PROD_CLOVER_API_BASE_URL) {
    candidates.push(PROD_CLOVER_API_BASE_URL);
  }
  if (normalized !== DEFAULT_CLOVER_API_BASE_URL) {
    candidates.push(DEFAULT_CLOVER_API_BASE_URL);
  }

  return [...new Set(candidates)];
};

const isRetryableCloverLookupError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("unauthorized") || message.includes("forbidden");
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }
  const requestId = createRequestId();
  const debugLogs = isDebugLoggingEnabled();
  res.setHeader("X-Request-Id", requestId);

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const allowedOrigins = buildAllowedOrigins(
    process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "",
    process.env.ALLOWED_CHECKOUT_ORIGINS?.trim() || "",
  );
  if (!validateOrigin(req, allowedOrigins)) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }

  const rateResult = checkRateLimit({
    key: `order-status:${getClientIp(req)}`,
    limit: Number(process.env.ORDER_STATUS_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.ORDER_STATUS_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many order status requests.");
    return;
  }

  if (!isOrderStoreConfigured()) {
    sendError(res, 500, "ORDER_STATUS_NOT_CONFIGURED", "Order status is not configured right now.");
    return;
  }

  const orderId = getQueryValue(req, "orderId").trim();
  const checkoutId = getQueryValue(req, "checkoutId").trim() || getQueryValue(req, "session_id").trim();

  if (!orderId && !checkoutId) {
    sendError(res, 400, "MISSING_IDENTIFIER", "Provide orderId or checkoutId.");
    return;
  }

  let order = orderId ? await findOrderById(orderId) : await findOrderByCheckoutId(checkoutId);
  if (!order) {
    sendError(res, 404, "ORDER_NOT_FOUND", "Order was not found.");
    return;
  }

  const shouldVerifyWithClover = order.paymentStatus === "pending" && (order.cloverCheckoutId || checkoutId);
  if (shouldVerifyWithClover) {
    const merchantId = process.env.CLOVER_MERCHANT_ID?.trim() || "";
    const privateToken = process.env.CLOVER_PRIVATE_TOKEN?.trim() || "";
    const apiBaseUrl = (process.env.CLOVER_API_BASE_URL?.trim() || DEFAULT_CLOVER_API_BASE_URL).replace(/\/+$/, "");
    const targetCheckoutId = order.cloverCheckoutId || checkoutId;
    const attemptLogs: Array<{
      baseCandidate: string;
      result: "success" | "error";
      isPaid?: boolean;
      paymentReference?: string;
      error?: string;
      statusCode?: number;
      cloverRequestId?: string;
      endpoint?: string;
    }> = [];

    if (merchantId && privateToken && targetCheckoutId) {
      try {
        let cloverStatus: Awaited<ReturnType<typeof fetchCloverCheckoutStatus>> | null = null;
        let lookupError: unknown = null;
        const cloverBaseCandidates = getCloverApiBaseCandidates(apiBaseUrl);

        for (const baseCandidate of cloverBaseCandidates) {
          try {
            cloverStatus = await fetchCloverCheckoutStatus({
              apiBaseUrl: baseCandidate,
              merchantId,
              privateToken,
              checkoutId: targetCheckoutId,
              timeoutMs: Number(process.env.CLOVER_TIMEOUT_MS || 12_000),
            });
            attemptLogs.push({
              baseCandidate,
              result: "success",
              isPaid: cloverStatus.isPaid,
              paymentReference: cloverStatus.paymentReference,
            });
            break;
          } catch (error) {
            lookupError = error;
            const cloverContext =
              error instanceof CloverApiError
                ? {
                    statusCode: error.context.statusCode,
                    cloverRequestId: error.context.responseRequestId,
                    endpoint: error.context.endpoint,
                  }
                : {};
            attemptLogs.push({
              baseCandidate,
              result: "error",
              error: safeErrorMessage(error),
              ...cloverContext,
            });
            if (!isRetryableCloverLookupError(error)) {
              break;
            }
          }
        }

        if (!cloverStatus && lookupError) {
          throw lookupError;
        }

        if (debugLogs) {
          console.log("[order-status] Clover fallback attempts", {
            requestId,
            orderId: order.id,
            checkoutId: targetCheckoutId,
            configuredApiBase: apiBaseUrl,
            attempts: attemptLogs,
          });
        }

        if (cloverStatus?.isPaid) {
          order = await markOrderPaidAndDecrementInventory({
            orderId: order.id,
            paymentReference: cloverStatus.paymentReference || targetCheckoutId,
          });

          if (!order.confirmationEmailSentAt) {
            await sendOrderConfirmationEmail(order);
            await markConfirmationEmailSent(order.id);
            order = (await findOrderById(order.id)) || order;
          }
        }
      } catch (error) {
        console.error("[order-status] Clover fallback verification failed", {
          requestId,
          orderId: order.id,
          checkoutId: targetCheckoutId,
          configuredApiBase: apiBaseUrl,
          error: safeErrorMessage(error),
          attempts: attemptLogs,
          cloverContext:
            error instanceof CloverApiError
              ? {
                  statusCode: error.context.statusCode,
                  endpoint: error.context.endpoint,
                  apiBaseUrl: error.context.apiBaseUrl,
                  cloverRequestId: error.context.responseRequestId,
                  responseBody: error.context.responseBody,
                }
              : undefined,
        });
      }
    } else if (debugLogs) {
      console.warn("[order-status] skipped Clover fallback verification", {
        requestId,
        orderId: order.id,
        checkoutId: targetCheckoutId,
        hasMerchantId: Boolean(merchantId),
        hasPrivateToken: Boolean(privateToken),
      });
    }
  }

  const confirmed = order.paymentStatus === "paid";
  const pending = order.paymentStatus === "pending";

  res.status(200).json({
    orderId: order.id,
    paymentStatus: order.paymentStatus,
    confirmed,
    pending,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
  });
}
