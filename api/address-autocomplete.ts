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
import { isMapboxConfigured, retrieveAddressAutofillSelection, suggestAddressAutofill } from "../server/lib/mapbox.js";

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_VERIFY_RATE_LIMIT = 40;
const DEFAULT_VERIFY_RATE_WINDOW_MS = 60_000;
const locationTextRegex = /^[\p{L}\p{M}.'\- ]+$/u;
const genericPostalRegex = /^[A-Za-z0-9][A-Za-z0-9\- ]{2,19}$/;

const lookupRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(160).optional(),
    mapboxId: z.string().trim().min(1).max(200).optional(),
    country: z.string().trim().max(80).optional(),
    sessionToken: z.string().trim().min(8).max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.query && !value.mapboxId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either query or mapboxId is required.",
        path: ["query"],
      });
    }
  });

const verificationRequestSchema = z
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const normalizeCountryCode = (value: string | undefined) => {
  const normalized = normalizeWhitespace(value || "");
  if (!normalized) {
    return "";
  }

  const compact = normalized.replace(/[^a-zA-Z]/g, "").toLowerCase();
  if (compact === "canada" || compact === "ca" || compact === "can") {
    return "CA";
  }
  if (compact === "unitedstates" || compact === "unitedstatesofamerica" || compact === "usa" || compact === "us") {
    return "US";
  }

  return normalized.length === 2 ? normalized.toUpperCase() : normalized.toUpperCase();
};

const toCountryDisplayName = (countryCode: string) => {
  switch (countryCode) {
    case "CA":
      return "Canada";
    case "US":
      return "United States";
    default:
      return countryCode;
  }
};

const normalizeState = (value: string) => {
  const normalized = normalizeWhitespace(value);
  return normalized.length === 2 ? normalized.toUpperCase() : normalized;
};

const normalizePostalCode = (value: string, countryCode: string) => {
  const normalized = normalizeWhitespace(value).toUpperCase();
  if (!normalized) {
    return "";
  }

  if (countryCode === "CA") {
    const compact = normalized.replace(/\s+/g, "");
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
      return "";
    }
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }

  if (countryCode === "US") {
    const compact = normalized.replace(/\s+/g, "");
    if (!/^\d{5}(-\d{4})?$/.test(compact)) {
      return "";
    }
    return compact;
  }

  return genericPostalRegex.test(normalized) ? normalized : "";
};

const validateLocationText = (value: string) => locationTextRegex.test(normalizeWhitespace(value));

const buildNormalizedAddress = (customer: z.infer<typeof verificationRequestSchema>["customer"]) => {
  const countryCode = normalizeCountryCode(customer.country);
  const postalCode = normalizePostalCode(customer.postalCode, countryCode);

  return {
    address: normalizeWhitespace(customer.address),
    city: normalizeWhitespace(customer.city),
    state: normalizeState(customer.state),
    postalCode,
    country: toCountryDisplayName(countryCode || normalizeCountryCode(customer.country)),
    countryCode,
  };
};

const validateNormalizedAddress = ({
  address,
  city,
  state,
  postalCode,
  country,
  countryCode,
}: ReturnType<typeof buildNormalizedAddress>) => {
  if (address.length < 4) {
    return "Street address is required.";
  }
  if (city.length < 2 || !validateLocationText(city)) {
    return "City format is invalid.";
  }
  if (state.length < 2 || !validateLocationText(state)) {
    return "State / Province format is invalid.";
  }
  if (!postalCode) {
    return countryCode === "CA"
      ? "Canadian postal code format is invalid."
      : countryCode === "US"
      ? "US ZIP code format is invalid."
      : "Postal code format is invalid.";
  }
  if (!countryCode || country.length < 2) {
    return "Country format is invalid.";
  }

  return "";
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const allowedOrigins = buildAllowedOrigins(
    process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "",
    process.env.ALLOWED_CHECKOUT_ORIGINS?.trim() || "",
  );
  const allowedOrigin = resolveAllowedOrigin(req, allowedOrigins, { allowMissingOrigin: false });
  if (!allowedOrigin) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }
  applyCorsResponseHeaders(res, allowedOrigin, ["POST"]);

  const rawBody = await readRawBody(req);
  const parsedBody = parseJsonBody<unknown>(rawBody);
  if (!parsedBody) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const isVerificationRequest = isRecord(parsedBody) && "customer" in parsedBody;
  const rateResult = await checkRateLimit({
    key: `${isVerificationRequest ? "address-verify" : "address-autocomplete"}:${getClientIp(req)}`,
    limit: Number(
      isVerificationRequest
        ? process.env.ADDRESS_VERIFY_RATE_LIMIT || DEFAULT_VERIFY_RATE_LIMIT
        : process.env.ADDRESS_AUTOCOMPLETE_RATE_LIMIT || DEFAULT_RATE_LIMIT,
    ),
    windowMs: Number(
      isVerificationRequest
        ? process.env.ADDRESS_VERIFY_RATE_WINDOW_MS || DEFAULT_VERIFY_RATE_WINDOW_MS
        : process.env.ADDRESS_AUTOCOMPLETE_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS,
    ),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(
      res,
      429,
      "RATE_LIMITED",
      isVerificationRequest
        ? "Too many address confirmation requests. Please try again shortly."
        : "Too many address lookup requests. Please try again shortly.",
    );
    return;
  }

  if (isVerificationRequest) {
    if (looksAutomatedTraffic(req)) {
      sendError(res, 403, "BOT_DETECTED", "Automated requests are not allowed.");
      return;
    }

    const validation = verificationRequestSchema.safeParse(parsedBody);
    if (!validation.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Address confirmation request is invalid.", validation.error.flatten());
      return;
    }

    const { customer } = validation.data;
    if (customer.deliveryMethod === "pickup") {
      res.status(200).json({
        verificationStatus: "skipped",
        message: "Pick up in store selected. No address confirmation is required.",
      });
      return;
    }

    const normalizedAddress = buildNormalizedAddress(customer);
    const validationMessage = validateNormalizedAddress(normalizedAddress);
    if (validationMessage) {
      sendError(res, 422, "ADDRESS_INVALID", validationMessage);
      return;
    }

    res.status(200).json({
      verificationStatus: "verified",
      message: "Address confirmed. Shipping is ready to load.",
      normalizedAddress,
      residential: null,
    });
    return;
  }

  const validation = lookupRequestSchema.safeParse(parsedBody);
  if (!validation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Address lookup request is invalid.", validation.error.flatten());
    return;
  }

  const { query = "", mapboxId = "", country, sessionToken } = validation.data;

  if (!query && mapboxId) {
    if (!isMapboxConfigured()) {
      res.status(200).json({ configured: false, address: null });
      return;
    }

    try {
      const address = await retrieveAddressAutofillSelection({
        mapboxId,
        preferredCountry: country,
        sessionToken,
      });
      res.status(200).json({
        configured: true,
        address,
      });
    } catch (error) {
      logger.error("address-autocomplete.retrieve_failed", {
        error: error instanceof Error ? error.message : String(error),
        mapboxId,
        country: country || "",
      });
      sendError(
        res,
        502,
        "AUTOCOMPLETE_RETRIEVE_FAILED",
        error instanceof Error ? error.message : "Unable to load this address selection right now.",
      );
    }
    return;
  }

  if (query.trim().length < 3) {
    res.status(200).json({ configured: isMapboxConfigured(), sessionToken: sessionToken || "", suggestions: [] });
    return;
  }

  if (!isMapboxConfigured()) {
    res.status(200).json({ configured: false, suggestions: [] });
    return;
  }

  try {
    const payload = await suggestAddressAutofill({
      query,
      preferredCountry: country,
      sessionToken,
    });
    res.status(200).json({
      configured: true,
      sessionToken: payload.sessionToken,
      suggestions: payload.suggestions,
    });
  } catch (error) {
    logger.error("address-autocomplete.lookup_failed", {
      error: error instanceof Error ? error.message : String(error),
      queryLength: query.trim().length,
      country: country || "",
    });
    sendError(
      res,
      502,
      "AUTOCOMPLETE_FAILED",
      error instanceof Error ? error.message : "Unable to load address suggestions right now.",
    );
  }
}
