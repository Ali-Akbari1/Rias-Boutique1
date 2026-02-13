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

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    res.status(500).json({
      error: "Missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID on the server.",
    });
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
      res.status(response.status).json({
        error: payload?.error?.message || "Google Places API request failed.",
      });
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
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}
