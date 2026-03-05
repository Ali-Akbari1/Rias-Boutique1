import { z } from "zod";
import { parseJsonBody, readRawBody, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import {
  buildAllowedOrigins,
  canonicalizeCartItems,
  createCartToken,
  getClientIp,
  validateOrigin,
} from "../server/lib/security.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";

const tokenRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().trim().min(1).max(120),
            quantity: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const secret = process.env.CART_TOKEN_SECRET?.trim() || "";
  if (!secret) {
    sendError(res, 404, "TOKEN_DISABLED", "Cart token signing is disabled.");
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
    key: `cart-token:${getClientIp(req)}`,
    limit: Number(process.env.CART_TOKEN_RATE_LIMIT || 60),
    windowMs: Number(process.env.CART_TOKEN_RATE_WINDOW_MS || 60_000),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many requests.");
    return;
  }

  const rawBody = await readRawBody(req);
  const parsed = parseJsonBody<unknown>(rawBody);
  if (!parsed) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const validation = tokenRequestSchema.safeParse(parsed);
  if (!validation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Cart token request is invalid.", validation.error.flatten());
    return;
  }

  const canonicalCart = canonicalizeCartItems(validation.data.items);
  const timestamp = Date.now();
  const token = createCartToken({
    secret,
    canonicalCart,
    timestamp,
  });

  res.status(200).json({
    cartToken: token,
    cartTimestamp: timestamp,
  });
}
