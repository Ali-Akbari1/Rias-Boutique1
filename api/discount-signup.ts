import { z } from "zod";
import {
  parseJsonBody,
  readRawBody,
  sendError,
  type ApiRequest,
  type ApiResponse,
} from "../server/lib/http.js";
import { logger } from "../server/lib/logger.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import {
  applyCorsResponseHeaders,
  buildAllowedOrigins,
  getClientIp,
  looksAutomatedTraffic,
  resolveAllowedOrigin,
} from "../server/lib/security.js";
import {
  getWelcomeDiscountExpiryDisplay,
  getWelcomeDiscountExpiryIso,
  isWelcomeDiscountActive,
  WELCOME_DISCOUNT_CODE,
} from "../server/lib/launch-discount.js";
import {
  isDiscountSubscriberStoreConfigured,
  markDiscountSubscriberEmailSent,
  upsertDiscountSubscriber,
} from "../server/lib/discount-subscribers.js";
import { sendWelcomeDiscountEmail } from "../server/lib/email.js";

const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_CAMPAIGN_NAME = "welcome10_first_order";
const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "redacted";
  }
  const visible = Math.min(2, local.length);
  return `${local.slice(0, visible)}***@${domain}`;
};

const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(160),
    fullName: z.string().trim().max(120).optional(),
    source: z.string().trim().max(80).optional(),
    website: z.string().trim().max(0).optional(),
  })
  .strict();

const getBaseUrl = () => process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const allowedOrigins = buildAllowedOrigins(
    getBaseUrl(),
    [process.env.ALLOWED_PROMO_ORIGINS?.trim() || "", process.env.ALLOWED_CHECKOUT_ORIGINS?.trim() || ""]
      .filter(Boolean)
      .join(","),
  );
  const allowedOrigin = resolveAllowedOrigin(req, allowedOrigins, { allowMissingOrigin: false });
  if (!allowedOrigin) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }
  applyCorsResponseHeaders(res, allowedOrigin, ["POST"]);

  const rateResult = await checkRateLimit({
    key: `discount-signup:${getClientIp(req)}`,
    limit: Number(process.env.DISCOUNT_SIGNUP_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.DISCOUNT_SIGNUP_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many discount signup attempts. Please try again shortly.");
    return;
  }

  if (!isWelcomeDiscountActive()) {
    const expiryDisplay = getWelcomeDiscountExpiryDisplay();
    sendError(
      res,
      410,
      "DISCOUNT_EXPIRED",
      expiryDisplay ? `This welcome offer expired on ${expiryDisplay}.` : "This welcome offer is not active right now.",
    );
    return;
  }

  if (looksAutomatedTraffic(req)) {
    sendError(res, 403, "BOT_DETECTED", "Automated traffic is not allowed.");
    return;
  }

  const rawBody = await readRawBody(req);
  const payload = parseJsonBody<unknown>(rawBody);
  if (!payload) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const parsed = signupSchema.safeParse(payload);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Signup details are invalid.", parsed.error.flatten());
    return;
  }

  const signupInput = parsed.data;
  const email = signupInput.email.trim().toLowerCase();
  const fullName = (signupInput.fullName || "").trim();
  const source = (signupInput.source || "welcome-popup").trim() || "welcome-popup";

  if (isDiscountSubscriberStoreConfigured()) {
    try {
      await upsertDiscountSubscriber({
        email,
        fullName,
        source,
        campaign: process.env.DISCOUNT_CAMPAIGN_NAME?.trim() || DEFAULT_CAMPAIGN_NAME,
        code: WELCOME_DISCOUNT_CODE,
        metadataJson: {
          source,
          subscribedFrom: "website-popup",
        },
      });
    } catch (error) {
      logger.error("discount-signup.store_failed", {
        email: maskEmail(email),
        source,
        error: error instanceof Error ? error.message : String(error),
      });
      sendError(res, 500, "SIGNUP_STORE_FAILED", "Unable to save your signup right now. Please try again.");
      return;
    }
  } else {
    logger.warn("discount-signup.store_not_configured", {
      email: maskEmail(email),
      source,
    });
  }

  try {
    const emailDispatch = await sendWelcomeDiscountEmail({
      to: email,
      fullName,
      code: WELCOME_DISCOUNT_CODE,
      expiresAtDisplay: getWelcomeDiscountExpiryDisplay(),
    });

    if (isDiscountSubscriberStoreConfigured()) {
      try {
        await markDiscountSubscriberEmailSent(email);
      } catch (error) {
        logger.warn("discount-signup.store_last_email_timestamp_failed", {
          email: maskEmail(email),
          source,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.status(200).json({
      success: true,
      expiresAt: getWelcomeDiscountExpiryIso() || null,
      expiresOn: getWelcomeDiscountExpiryDisplay() || null,
      emailProvider: emailDispatch.provider,
      emailStatus: emailDispatch.status,
    });
  } catch (error) {
    logger.error("discount-signup.email_failed", {
      email: maskEmail(email),
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    sendError(res, 502, "DISCOUNT_EMAIL_FAILED", "Unable to send discount email right now. Please try again.");
  }
}
