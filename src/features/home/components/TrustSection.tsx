import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, ExternalLink, ShieldCheck, Star, Truck } from "lucide-react";
import {
  featuredStoreReviews,
  getGoogleReviewsUrl,
  trustBadges,
  type GoogleReviewsResponse,
  type StoreReview,
} from "@/features/store/data/store-content";
import { requestGoogleReviews } from "@/lib/site-api";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import Reveal from "@/shared/ui/reveal";

const isGoogleReviewsApiEnabled = () =>
  (import.meta.env.VITE_ENABLE_GOOGLE_REVIEWS_API as string | undefined)?.trim().toLowerCase() === "true";

const TrustSection = () => {
  const fallbackReviews = useMemo(() => featuredStoreReviews, []);
  const googleReviewsApiEnabled = isGoogleReviewsApiEnabled();
  const [reviews, setReviews] = useState<StoreReview[]>(fallbackReviews);
  const [reviewStartIndex, setReviewStartIndex] = useState(0);
  const [googleMapsUri, setGoogleMapsUri] = useState<string>("");
  const [placeName, setPlaceName] = useState<string>("Ria's Boutique");
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [totalRatings, setTotalRatings] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(googleReviewsApiEnabled);
  const defaultGoogleUrl = getGoogleReviewsUrl();
  const gcrMerchantId = (import.meta.env.VITE_GCR_MERCHANT_ID || "5741454598").trim();

  useEffect(() => {
    if (!googleReviewsApiEnabled) {
      setReviews(fallbackReviews);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchGoogleReviews = async () => {
      try {
        const payload = await requestGoogleReviews();
        if (!isMounted) {
          return;
        }

        if (payload.placeName) {
          setPlaceName(payload.placeName);
        }
        if (typeof payload.rating === "number") {
          setOverallRating(payload.rating);
        }
        if (typeof payload.userRatingCount === "number") {
          setTotalRatings(payload.userRatingCount);
        }
        if (payload.googleMapsUri) {
          setGoogleMapsUri(payload.googleMapsUri);
        }
        if (payload.reviews.length > 0) {
          setReviews(payload.reviews);
        }
      } catch {
        if (isMounted) {
          setReviews(fallbackReviews);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchGoogleReviews();

    return () => {
      isMounted = false;
    };
  }, [fallbackReviews, googleReviewsApiEnabled]);

  useEffect(() => {
    if (reviews.length <= 1) {
      setReviewStartIndex(0);
      return;
    }

    const rotationInterval = window.setInterval(() => {
      setReviewStartIndex((current) => (current + 1) % reviews.length);
    }, 5000);

    return () => {
      window.clearInterval(rotationInterval);
    };
  }, [reviews]);

  useEffect(() => {
    if (!gcrMerchantId) {
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-gcr-badge-inline="true"]');
    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/platform.js";
    script.async = true;
    script.defer = true;
    script.setAttribute("data-gcr-badge-inline", "true");
    document.body.appendChild(script);
  }, [gcrMerchantId]);

  const rotatingReviews = useMemo(() => {
    if (reviews.length === 0) {
      return [];
    }

    const visibleCount = Math.min(3, reviews.length);
    return Array.from({ length: visibleCount }, (_, offset) => reviews[(reviewStartIndex + offset) % reviews.length]);
  }, [reviewStartIndex, reviews]);

  const viewReviewsUrl = googleMapsUri || defaultGoogleUrl;

  return (
    <section id="reviews" className="bg-card/30 py-16 sm:py-20">
      <div className="container mx-auto space-y-10 px-4 sm:px-6">
        <Reveal className="text-center">
          <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Trust & Quality</p>
          <h2 className="text-3xl font-display font-bold text-foreground sm:text-4xl">What Customers Say</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {overallRating && totalRatings
              ? `${placeName} is rated ${overallRating.toFixed(1)} out of 5 from ${totalRatings} Google reviews.`
              : "Showing recent customer feedback from Google."}
          </p>
        </Reveal>

        <div className="grid gap-4 lg:grid-cols-3">
          {rotatingReviews.map((review, index) => (
            <Reveal key={`${review.id}-${reviewStartIndex}-${index}`} delayMs={index * 80}>
              <Card className="border-border bg-background">
                <CardContent className="pt-6">
                  <p className="mb-2 inline-flex items-center gap-1 text-[#d4af37]">
                    {Array.from({ length: Math.max(1, Math.min(5, Math.round(review.rating))) }).map((_, idx) => (
                      <Star key={`${review.id}-${idx}`} className="h-4 w-4 fill-current" />
                    ))}
                  </p>
                  <p className="font-body text-base leading-relaxed text-foreground">"{review.quote}"</p>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {review.authorUrl ? (
                      <a href={review.authorUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {review.author}
                      </a>
                    ) : (
                      review.author
                    )}
                  </p>
                  <p className="text-xs font-body text-muted-foreground">{review.relativeTime || review.publishedAt}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {trustBadges.map((badge, index) => (
            <Reveal key={badge.id} delayMs={index * 90}>
              <Card className="border-border bg-background">
                <CardContent className="pt-6">
                  <div className="mb-3 inline-flex rounded-full bg-muted p-2 text-primary">
                    {badge.id === "custom-orders" && <BadgeCheck className="h-5 w-5" />}
                    {badge.id === "authentic-craft" && <ShieldCheck className="h-5 w-5" />}
                    {badge.id === "tracked-shipping" && <Truck className="h-5 w-5" />}
                  </div>
                  <p className="font-display text-xl font-semibold text-foreground">{badge.label}</p>
                  <p className="mt-2 font-body text-sm text-muted-foreground">{badge.description}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>

        {gcrMerchantId && (
          <div className="flex flex-col items-center gap-2">
            <div
              className="rounded-full border border-border bg-background px-6 py-3 shadow-sm"
              dangerouslySetInnerHTML={{
                __html: `<g:ratingbadge merchant_id="${gcrMerchantId}"></g:ratingbadge>`,
              }}
            />
            <p className="text-xs text-muted-foreground">Google Customer Reviews badge (desktop only).</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <Button asChild className="h-11 px-6 text-base font-semibold group">
            <a href={viewReviewsUrl} target="_blank" rel="noreferrer">
              View Google Reviews
              <ExternalLink className="h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-y-0.5" />
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            {googleReviewsApiEnabled
              ? isLoading
                ? "Loading live Google reviews..."
                : "Live Google reviews loaded when available."
              : "Showing curated customer reviews."}
          </p>
        </div>
      </div>
    </section>
  );
};

export default TrustSection;


