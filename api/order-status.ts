import {
  findOrderByCheckoutId,
  findOrderById,
  isOrderStoreConfigured,
  markConfirmationEmailSent,
  markOrderPaidAndDecrementInventory,
} from "../server/lib/order-store.js";
import { createDeterministicHash, getQueryValue, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import { logger } from "../server/lib/logger.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import {
  applyCorsResponseHeaders,
  buildAllowedOrigins,
  getClientIp,
  resolveAllowedOrigin,
} from "../server/lib/security.js";
import { CloverApiError, fetchCloverCheckoutStatus } from "../server/lib/clover.js";
import { sendOrderConfirmationEmail } from "../server/lib/email.js";
import { ensureShipmentForOrder } from "../server/lib/order-fulfillment.js";
import { getShippingProviderMode } from "../server/lib/checkout-pricing.js";
import { isEasyPostConfigured } from "../server/lib/easypost.js";
import { hasSupabaseAdminConfig } from "../server/lib/supabase-admin.js";
import { z } from "zod";

const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_CLOVER_API_BASE_URL = "https://apisandbox.dev.clover.com";
const PROD_CLOVER_API_BASE_URL = "https://api.clover.com";
const isDebugLoggingEnabled = () => process.env.CLOVER_DEBUG_LOGS?.trim().toLowerCase() === "true";
const createRequestId = () => createDeterministicHash(`${Date.now()}|${Math.random()}`).slice(0, 12);
const safeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const orderStatusQuerySchema = z
  .object({
    orderId: z.string().trim().max(128).optional(),
    checkoutId: z.string().trim().max(128).optional(),
    sessionId: z.string().trim().max(128).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.orderId && !value.checkoutId && !value.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["orderId"],
        message: "Provide orderId or checkoutId.",
      });
    }
  });

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

const normalizeCountryCode = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const compact = trimmed.replace(/[^a-z]/g, "");
  if (["ca", "can", "canada"].includes(compact)) {
    return "CA";
  }
  if (["us", "usa", "unitedstates", "unitedstatesofamerica"].includes(compact)) {
    return "US";
  }

  return trimmed.toUpperCase();
};

const toDateOnly = (value: string) => {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  if (getQueryValue(req, "health").trim() === "1") {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        orderStoreConfigured: isOrderStoreConfigured(),
        supabaseAdminConfigured: hasSupabaseAdminConfig(),
        shippingProviderMode: getShippingProviderMode(),
        easypostConfigured: isEasyPostConfigured(),
        upstashConfigured: Boolean(
          process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
        ),
      },
    });
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
  const allowedOrigin = resolveAllowedOrigin(req, allowedOrigins, { allowMissingOrigin: false });
  if (!allowedOrigin) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }
  applyCorsResponseHeaders(res, allowedOrigin, ["GET"]);

  const rateResult = await checkRateLimit({
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

  const queryValidation = orderStatusQuerySchema.safeParse({
    orderId: getQueryValue(req, "orderId").trim() || undefined,
    checkoutId: getQueryValue(req, "checkoutId").trim() || undefined,
    sessionId: getQueryValue(req, "session_id").trim() || undefined,
  });
  if (!queryValidation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Order status query is invalid.", queryValidation.error.flatten());
    return;
  }

  const { orderId = "", checkoutId = "", sessionId = "" } = queryValidation.data;
  const resolvedCheckoutId = checkoutId || sessionId;

  let order = orderId ? await findOrderById(orderId) : await findOrderByCheckoutId(resolvedCheckoutId);
  if (!order) {
    sendError(res, 404, "ORDER_NOT_FOUND", "Order was not found.");
    return;
  }

  const shouldVerifyWithClover = order.paymentStatus === "pending" && (order.cloverCheckoutId || resolvedCheckoutId);
  if (shouldVerifyWithClover) {
    const merchantId = process.env.CLOVER_MERCHANT_ID?.trim() || "";
    const privateToken = process.env.CLOVER_PRIVATE_TOKEN?.trim() || "";
    const apiBaseUrl = (process.env.CLOVER_API_BASE_URL?.trim() || DEFAULT_CLOVER_API_BASE_URL).replace(/\/+$/, "");
    const targetCheckoutId = order.cloverCheckoutId || resolvedCheckoutId;
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
          logger.debug("order-status.clover_fallback_attempts", {
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

          if (order.customer.deliveryMethod === "shipping" && !order.shipment) {
            try {
              order = await ensureShipmentForOrder(order);
            } catch (shipmentError) {
              logger.error("order-status.shipment_purchase_failed", {
                requestId,
                orderId: order.id,
                checkoutId: targetCheckoutId,
                error: safeErrorMessage(shipmentError),
              });
            }
          }

          if (!order.confirmationEmailSentAt) {
            try {
              await sendOrderConfirmationEmail(order);
              await markConfirmationEmailSent(order.id);
              order = (await findOrderById(order.id)) || order;
            } catch (emailError) {
              logger.error("order-status.confirmation_email_failed", {
                requestId,
                orderId: order.id,
                checkoutId: targetCheckoutId,
                error: safeErrorMessage(emailError),
              });
            }
          }
        }
      } catch (error) {
        logger.error("order-status.clover_fallback_verification_failed", {
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
      logger.warn("order-status.clover_fallback_skipped", {
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
  const deliveryCountry = normalizeCountryCode(order.customer.country);
  const deliveryDateFromQuote = toDateOnly(order.shippingQuote?.deliveryDate || "");
  let estimatedDeliveryDate = deliveryDateFromQuote;

  if (!estimatedDeliveryDate) {
    const baseDate = new Date(order.paidAt || order.createdAt || Date.now());
    const offsetDays = order.customer.deliveryMethod === "pickup" ? 1 : 7;
    baseDate.setDate(baseDate.getDate() + offsetDays);
    estimatedDeliveryDate = baseDate.toISOString().slice(0, 10);
  }

  res.status(200).json({
    orderId: order.id,
    paymentStatus: order.paymentStatus,
    confirmed,
    pending,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    customerEmail: order.customer.email || null,
    deliveryCountry: deliveryCountry || null,
    estimatedDeliveryDate: estimatedDeliveryDate || null,
  });
}
