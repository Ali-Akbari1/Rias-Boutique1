import { sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import { buildAllowedOrigins, getClientIp, validateOrigin } from "../server/lib/security.js";

type GoogleAuthorAttribution = {
  displayName?: string;
  uri?: string;
  photoUri?: string;
};

type GoogleReview = {
  name?: string;
  rating?: number;
  text?: { text?: string };
  publishTime?: string;
  relativePublishTimeDescription?: string;
  authorAttribution?: GoogleAuthorAttribution;
};

type GooglePlaceDetailsResponse = {
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: GoogleReview[];
  error?: { message?: string };
};

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;

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
    key: `google-reviews:${getClientIp(req)}`,
    limit: Number(process.env.GOOGLE_REVIEWS_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.GOOGLE_REVIEWS_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many review requests.");
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    sendError(res, 500, "GOOGLE_REVIEWS_NOT_CONFIGURED", "Google reviews are not configured right now.");
    return;
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`;
    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "displayName,rating,userRatingCount,googleMapsUri,reviews",
      },
    });

    const payload = (await response.json()) as GooglePlaceDetailsResponse;

    if (!response.ok) {
      sendError(res, response.status, "GOOGLE_REVIEWS_PROVIDER_ERROR", payload?.error?.message || "Google Places API request failed.");
      return;
    }

    const reviews = (payload.reviews ?? []).slice(0, 6).map((review, index) => ({
      id: review.name || `google-review-${index}`,
      author: review.authorAttribution?.displayName || "Google user",
      rating: review.rating ?? 0,
      quote: review.text?.text || "",
      publishedAt: review.publishTime || "",
      relativeTime: review.relativePublishTimeDescription || "",
      authorUrl: review.authorAttribution?.uri || "",
      profilePhotoUrl: review.authorAttribution?.photoUri || "",
    }));

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({
      placeName: payload.displayName?.text || "",
      rating: typeof payload.rating === "number" ? payload.rating : null,
      userRatingCount: typeof payload.userRatingCount === "number" ? payload.userRatingCount : null,
      googleMapsUri: payload.googleMapsUri || null,
      reviews,
    });
  } catch (error) {
    sendError(res, 500, "GOOGLE_REVIEWS_SERVER_ERROR", error instanceof Error ? error.message : "Unexpected server error.");
  }
}
