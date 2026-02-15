export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface TrustBadgeItem {
  id: string;
  label: string;
  description: string;
}

export interface StoreReview {
  id: string;
  author: string;
  rating: number;
  quote: string;
  publishedAt: string;
  relativeTime?: string;
  authorUrl?: string;
  profilePhotoUrl?: string;
}

export interface InstagramCardItem {
  id: string;
  postUrl: string;
  thumbnailUrl: string;
  label?: string;
  isReel: boolean;
}

export interface GoogleReviewsResponse {
  placeName: string;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  reviews: StoreReview[];
}

export const shippingPolicy = {
  standardCost: "CA$12 flat rate",
  freeShippingThreshold: "CA$350+",
  standardTimeline: "5-8 business days (US & Canada)",
  expressCost: "CA$24",
  expressTimeline: "2-4 business days",
};

export const returnPolicy =
  "Returns and exchanges are accepted within 14 days of delivery for unworn, unaltered items with tags attached.";

export const faqItems: FaqItem[] = [
  {
    id: "faq-1",
    question: "How do I pick the right size?",
    answer:
      "Each product page includes fit notes and available sizes. If you are between sizes, choose the larger size for formal pieces with fitted bodices.",
  },
  {
    id: "faq-2",
    question: "Do you ship internationally?",
    answer:
      "We currently ship across North America and selected international destinations. Contact us before placing large international orders for exact rates.",
  },
  {
    id: "faq-3",
    question: "Can I exchange for another size?",
    answer:
      "Yes. Exchanges are allowed once per order within 14 days, subject to stock availability. Items must be unused and in original condition.",
  },
];

export const trustBadges: TrustBadgeItem[] = [
  {
    id: "secure-checkout",
    label: "Secure Checkout",
    description: "SSL-encrypted checkout with Stripe payment processing.",
  },
  {
    id: "authentic-craft",
    label: "Authentic Craftsmanship",
    description: "Hand-finished embroidery by Afghan artisans.",
  },
  {
    id: "easy-returns",
    label: "Easy Returns",
    description: "Simple 14-day return and exchange process.",
  },
];

export const featuredStoreReviews: StoreReview[] = [
  {
    id: "store-review-1",
    author: "Sahel Aria",
    rating: 5,
    quote: "Absolutely loved shopping at Ria's Boutique. Unique styles, high quality, and excellent customer service.",
    publishedAt: "2025-04-05",
  },
  {
    id: "store-review-2",
    author: "Sahar Nawabi",
    rating: 5,
    quote: "Amazing designs and amazing customer service! Definitely coming back! Thank you Rias Boutique :)",
    publishedAt: "2025-04-25",
  },
  {
    id: "store-review-3",
    author: "Arzoon",
    rating: 5,
    quote: "Great experience, been looking for an Eid dress and finally found one here. Great staff and very friendly.",
    publishedAt: "2025-06-12",
  },
];

const normalizeInstagramPostUrl = (url: string) => {
  const clean = url.trim();
  if (!clean) {
    return "";
  }

  const withoutQuery = clean.split("?")[0];
  return withoutQuery.endsWith("/") ? withoutQuery : `${withoutQuery}/`;
};

export const getGoogleReviewsUrl = () =>
  (import.meta.env.VITE_GOOGLE_REVIEWS_URL as string | undefined) ||
  "https://www.google.com/search?q=Ria's+Boutique+reviews";

export const getInstagramProfileUrl = () =>
  (import.meta.env.VITE_INSTAGRAM_PROFILE_URL as string | undefined) || "https://www.instagram.com/";

export const getInstagramCards = (): InstagramCardItem[] => {
  const rawCards = (import.meta.env.VITE_INSTAGRAM_CARDS as string | undefined) || "";

  return rawCards
    .split(",")
    .map((entry, index): InstagramCardItem | null => {
      const [rawPostUrl = "", rawThumbnailUrl = "", rawLabel = ""] = entry.split("|");
      const postUrl = normalizeInstagramPostUrl(rawPostUrl);
      const thumbnailUrl = rawThumbnailUrl.trim();
      const label = rawLabel.trim();

      if (!postUrl || !thumbnailUrl) {
        return null;
      }

      return {
        id: `instagram-card-${index + 1}`,
        postUrl,
        thumbnailUrl,
        isReel: postUrl.includes("/reel/"),
        ...(label ? { label } : {}),
      } satisfies InstagramCardItem;
    })
    .filter((card): card is InstagramCardItem => card !== null)
    .slice(0, 9);
};
