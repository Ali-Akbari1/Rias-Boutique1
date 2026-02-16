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
  {
    id: "store-review-4",
    author: "Maria Kabiri",
    rating: 5,
    quote: "I had an amazing experience at Ria's Boutique! The selection of traditional Afghan clothing and accessories is beautiful, and the quality is top-notch. The staff were incredibly friendly and knowledgeable, offering great advice and making the shopping experience enjoyable. I was especially impressed by the attention to detail in the craftsmanship of the items. If you're looking for authentic, high-quality Afghan products, this is definitely the place to go. Highly recommend!",
    publishedAt: "2025-03-16",
  },
  {
    id: "store-review-5",
    author: "Mustafa Hakimzada",
    rating: 5,
    quote: "I recently purchased a beautiful outfit from this boutique for my family, and I am really impressed! The quality of the fabric is excellent, and the design is stylish and modern. The fit is perfect, and it really stands out. Highly recommend this place for anyone looking for Afghan trendy and high-quality clothing. Thumbs up for Ria’s Afghan Boutique.",
    publishedAt: "2025-03-12",
  },
  {
    id: "store-review-6",
    author: "Mujda Sadat",
    rating: 5,
    quote: "I had a great experience at Ria’s Afghan Boutique! Their customer service was truly amazing -friendly, helpful, and attentive from start to finish.They offer a wonderful collection of high-quality Afghan clothes for both men and women, with stylish designs that really stand out. I'm so happy with my purchase and will definitely be coming back!",
    publishedAt: "2025-04-22",
  },
  {
    id: "store-review-7",
    author: "Behnaz Hakimzada",
    rating: 5,
    quote: "Had a wonderful experience in Ria’s Afghan Boutique. They offer great customer service and provide beautiful and unique designs of traditional clothes and jewelries with perfect quality.",
    publishedAt: "2025-04-22",
  },
  {
    id: "store-review-8",
    author: "Jamila Azizi",
    rating: 5,
    quote: "Great quality and unique designs at Riaz Afghan Boutique! Highly recommended!",
    publishedAt: "2025-04-22",
  },
  {
    id: "store-review-10",
    author: "Sonia Meet",
    rating: 5,
    quote: "One of the best place in Calgary and in New horizon mall where we can get all kinds of Afghan dresses and owner is very polite and kind .I highly recommend to everyone one",
    publishedAt: "2025-02-12",
  },
  {
    id: "store-review-11",
    author: "Yalda Ahangaran",
    rating: 5,
    quote: "Authentic Afghan clothing with beautiful craftsmanship at Riaz Afghan Boutique! Truly exceptional!",
    publishedAt: "2025-03-12",
  },
  {
    id: "store-review-12",
    author: "Victoria Barez",
    rating: 5,
    quote: "Great quality pieces and beautiful hand made chadors! Friendly and welcoming owners aswell!",
    publishedAt: "2024-03-12",
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
