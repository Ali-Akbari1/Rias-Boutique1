import { z } from "zod";
import { parseJsonBody, readRawBody, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import { logger } from "../server/lib/logger.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import {
  applyCorsResponseHeaders,
  buildAllowedOrigins,
  getClientIp,
  looksAutomatedTraffic,
  resolveAllowedOrigin,
} from "../server/lib/security.js";
import { sendProductInquiryEmail } from "../server/lib/email.js";

const DEFAULT_RATE_LIMIT = 12;
const DEFAULT_RATE_WINDOW_MS = 60_000;

type ProductInquiryPayload = {
  productId: string;
  productName: string;
  productSku?: string;
  productUrl: string;
  selectedVariant?: string;
  fullName: string;
  email: string;
  phone?: string;
  location: string;
  requiredByDate: string;
  occasion?: string;
  sizeNotes?: string;
  message: string;
  website?: string;
};

const getTodayDateString = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

const inquirySchema: z.ZodType<ProductInquiryPayload> = z
  .object({
    productId: z.string().trim().min(1).max(120),
    productName: z.string().trim().min(1).max(180),
    productSku: z.string().trim().max(120).optional(),
    productUrl: z.string().trim().url().max(500),
    selectedVariant: z.string().trim().max(160).optional(),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(160),
    phone: z.string().trim().max(30).optional(),
    location: z.string().trim().min(2).max(120),
    requiredByDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format."),
    occasion: z.string().trim().max(120).optional(),
    sizeNotes: z.string().trim().max(240).optional(),
    message: z.string().trim().min(10).max(2000),
    website: z.string().trim().max(0).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const today = getTodayDateString();
    if (value.requiredByDate < today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredByDate"],
        message: `Required by date must be today or later (${today}).`,
      });
    }
  });

const getBaseUrl = () =>
  process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || process.env.SITE_URL?.trim() || "https://www.riasboutique.com";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const allowedOrigins = buildAllowedOrigins(getBaseUrl(), process.env.ALLOWED_BROWSER_ORIGINS?.trim() || "");
  const allowedOrigin = resolveAllowedOrigin(req, allowedOrigins, { allowMissingOrigin: false });
  if (!allowedOrigin) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }
  applyCorsResponseHeaders(res, allowedOrigin, ["POST"]);

  const rateResult = await checkRateLimit({
    key: `product-inquiry:${getClientIp(req)}`,
    limit: Number(process.env.PRODUCT_INQUIRY_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.PRODUCT_INQUIRY_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many inquiry attempts. Please try again shortly.");
    return;
  }

  if (looksAutomatedTraffic(req)) {
    sendError(res, 403, "BOT_DETECTED", "Automated requests are not allowed.");
    return;
  }

  const rawBody = await readRawBody(req);
  const payload = parseJsonBody<unknown>(rawBody);
  if (!payload) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const parsed = inquirySchema.safeParse(payload);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Inquiry details are invalid.", parsed.error.flatten());
    return;
  }

  try {
    const { website: _website, ...emailPayload } = parsed.data;
    const emailDispatch = await sendProductInquiryEmail(emailPayload);
    res.status(200).json({
      success: true,
      emailProvider: emailDispatch.provider,
      emailStatus: emailDispatch.status,
    });
  } catch (error) {
    logger.error("product-inquiry.email_failed", {
      productId: parsed.data.productId,
      customerEmail: parsed.data.email,
      error: error instanceof Error ? error.message : String(error),
    });
    sendError(res, 502, "INQUIRY_EMAIL_FAILED", "Unable to send your inquiry right now. Please try again.");
  }
}
