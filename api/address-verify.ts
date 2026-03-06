import { z } from "zod";
import { parseJsonBody, readRawBody, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import {
  buildAllowedOrigins,
  getClientIp,
  looksAutomatedTraffic,
  validateOrigin,
} from "../server/lib/security.js";
import {
  describeEasyPostError,
  isEasyPostApiError,
  isEasyPostConfigured,
  toQuoteCustomer,
  verifyShippingAddress,
} from "../server/lib/easypost.js";

const DEFAULT_RATE_LIMIT = 40;
const DEFAULT_RATE_WINDOW_MS = 60_000;

const requestSchema = z
  .object({
    customer: z
      .object({
        deliveryMethod: z.enum(["shipping", "pickup"]).default("shipping"),
        fullName: z.string().trim().max(120).optional().default(""),
        email: z.string().trim().max(160).optional().default(""),
        phone: z.string().trim().max(22).optional().default(""),
        address: z.string().trim().min(4).max(200),
        city: z.string().trim().min(2).max(80),
        state: z.string().trim().min(2).max(80),
        postalCode: z.string().trim().min(3).max(20),
        country: z.string().trim().min(2).max(80),
      })
      .strict(),
  })
  .strict();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
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
    key: `address-verify:${getClientIp(req)}`,
    limit: Number(process.env.ADDRESS_VERIFY_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.ADDRESS_VERIFY_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many address verification requests. Please try again shortly.");
    return;
  }

  const rawBody = await readRawBody(req);
  const parsedBody = parseJsonBody<unknown>(rawBody);
  if (!parsedBody) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const validation = requestSchema.safeParse(parsedBody);
  if (!validation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Address verification request is invalid.", validation.error.flatten());
    return;
  }

  if (looksAutomatedTraffic(req)) {
    sendError(res, 403, "BOT_DETECTED", "Automated requests are not allowed.");
    return;
  }

  const { customer } = validation.data;
  if (customer.deliveryMethod === "pickup") {
    res.status(200).json({
      verificationStatus: "skipped",
      message: "Pick up in store selected. No address verification is required.",
    });
    return;
  }

  if (!isEasyPostConfigured()) {
    sendError(res, 503, "SHIPPING_NOT_CONFIGURED", "Shipping is not configured right now. Please contact support.");
    return;
  }

  try {
    const verifiedAddress = await verifyShippingAddress(toQuoteCustomer(customer));
    res.status(200).json({
      verificationStatus: "verified",
      ...verifiedAddress,
    });
  } catch (error) {
    console.error("[address-verify] verification failed", {
      error: describeEasyPostError(error),
      destinationCountry: customer.country,
      destinationPostalCode: customer.postalCode,
    });

    if (isEasyPostApiError(error) && error.statusCode >= 400 && error.statusCode < 500) {
      sendError(
        res,
        422,
        "ADDRESS_UNVERIFIED",
        error.message.replace(/^EasyPost API failed \(\d+\) on [^:]+:\s*/, ""),
        error.responseBody,
      );
      return;
    }

    sendError(
      res,
      502,
      "ADDRESS_VERIFY_FAILED",
      error instanceof Error ? error.message : "Unable to verify this address right now.",
    );
  }
}
