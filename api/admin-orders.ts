import {
  getHeader,
  safeTimingCompare,
  sendError,
  type ApiRequest,
  type ApiResponse,
} from "../server/lib/http.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import { buildAllowedOrigins, getClientIp, validateOrigin } from "../server/lib/security.js";
import { isOrderStoreConfigured, listOrders } from "../server/lib/order-store.js";

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;

const readAdminToken = (req: ApiRequest) => {
  const directHeader = (getHeader(req, "x-admin-token") || "").trim();
  if (directHeader) {
    return directHeader;
  }

  const authorizationHeader = (getHeader(req, "authorization") || "").trim();
  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  return "";
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const allowedOrigins = buildAllowedOrigins(
    process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "",
    process.env.ALLOWED_CHECKOUT_ORIGINS?.trim() || "",
  );
  if (!validateOrigin(req, allowedOrigins, { allowMissingOrigin: false })) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }

  const rateResult = checkRateLimit({
    key: `admin-orders:${getClientIp(req)}`,
    limit: Number(process.env.ADMIN_ORDERS_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.ADMIN_ORDERS_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many admin requests.");
    return;
  }

  if (!isOrderStoreConfigured()) {
    sendError(res, 500, "ADMIN_ORDERS_NOT_CONFIGURED", "Order store is not configured.");
    return;
  }

  const expectedToken = (process.env.ADMIN_DASHBOARD_TOKEN || "").trim();
  if (!expectedToken) {
    sendError(res, 500, "ADMIN_AUTH_NOT_CONFIGURED", "Admin dashboard token is not configured.");
    return;
  }

  const providedToken = readAdminToken(req);
  if (!providedToken || !safeTimingCompare(providedToken, expectedToken)) {
    sendError(res, 401, "UNAUTHORIZED", "Unauthorized request.");
    return;
  }

  const orders = await listOrders();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    orders,
    count: orders.length,
  });
}
