import { z } from "zod";
import { parseJsonBody, readRawBody, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import { buildAllowedOrigins, getClientIp, validateOrigin } from "../server/lib/security.js";
import { isMapboxConfigured, retrieveAddressAutofillSelection, suggestAddressAutofill } from "../server/lib/mapbox.js";

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;

const requestSchema = z
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
    key: `address-autocomplete:${getClientIp(req)}`,
    limit: Number(process.env.ADDRESS_AUTOCOMPLETE_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.ADDRESS_AUTOCOMPLETE_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many address lookup requests. Please try again shortly.");
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
      console.error("[address-autocomplete] retrieve failed", {
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
    console.error("[address-autocomplete] lookup failed", {
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
