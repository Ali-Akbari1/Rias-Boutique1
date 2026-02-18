import { findOrderByCheckoutId, findOrderById, isOrderStoreConfigured } from "../server/lib/order-store.js";
import { getQueryValue, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import { buildAllowedOrigins, getClientIp, validateOrigin } from "../server/lib/security.js";

const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_WINDOW_MS = 60_000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

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

  const order = orderId ? await findOrderById(orderId) : await findOrderByCheckoutId(checkoutId);
  if (!order) {
    sendError(res, 404, "ORDER_NOT_FOUND", "Order was not found.");
    return;
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
