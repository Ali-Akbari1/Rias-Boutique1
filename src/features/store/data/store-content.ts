import { getClientCommerceConfig } from "@/lib/commerce-config";
import { formatCad } from "@/lib/money";

const commerceConfig = getClientCommerceConfig();

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

export interface StorePickupDetails {
  address: string;
  mapsUrl: string;
  phoneDisplay: string;
  phoneHref: string;
  hours: string[];
  note: string;
}

export const shippingPolicy = {
  standardCost: `${formatCad(commerceConfig.flatShippingRateMinor / 100)} in Canada | ${formatCad(
    commerceConfig.flatShippingRateInternationalMinor / 100,
  )} outside Canada`,
  freeShippingThreshold: `${formatCad(commerceConfig.freeShippingThresholdMinor / 100)}+`,
  standardTimeline: "5-10 business days (Canada) | International varies",
};

export const returnPolicy =
  "All sales are final. We do not accept returns or offer refunds. Please review product details and sizing before placing your order.";

export const faqItems: FaqItem[] = [
  {
    id: "faq-1",
    question: "How do I pick the right size?",
    answer:
      "Each product page includes fit notes and available sizes. If you are between sizes, you can contact us for personalized recommendations based on your measurements and the specific item.",
  },
  {
    id: "faq-2",
    question: "Do you ship internationally?",
    answer:
      "Yes. We ship worldwide. International rates and delivery windows are calculated at checkout. Contact us before placing large international orders for exact rates.",
  },
  {
    id: "faq-3",
    question: "Can I exchange for another size?",
    answer:
      "At this time, we do not offer exchanges. Please review our sizing information carefully before placing your order. If you have questions about sizing, feel free to contact us before purchasing and we will be happy to help.",
  },
  {
    id: "faq-4",
    question: "What are your shipping rates and delivery times?",
    answer:
      "We offer standard shipping within Canada for a CA$30.00 flat rate at checkout, with delivery typically taking 5–10 business days. Orders over CA$400.00 qualify for free standard shipping within Canada. Outside Canada, standard shipping is CA$40.00 and delivery timelines vary by destination.",
  },
  {
    id: "faq-5",
    question: "How is shipping calculated?",
    answer:
      "Shipping is charged at a flat rate during checkout unless your order qualifies for free shipping. Orders over CA$400.00 automatically receive free standard shipping within Canada. Outside Canada, standard shipping is CA$40.00.",
  },
  {
    id: "faq-6",
    question: "Do you accept returns?",
    answer:
      "All sales are final. We do not accept returns or offer refunds. Please ensure you review product details and sizing before completing your purchase.",
  },
  {
    id: "faq-7",
    question: "How long does it take to process my order?",
    answer:
      "Orders are typically processed within 1–3 business days before being shipped. You will receive a confirmation email with tracking information once your order has been dispatched."
  },
  {
    id: "faq-8",
    question: "Do you offer pre-orders or customizable items?",
    answer:
      "Yes, we offer select items for pre-order or customization. Pre-order and custom items require a minimum production time of 4 weeks. Once your item is ready, shipping typically takes an additional 2 weeks depending on the destination. Please note that timelines may vary slightly depending on order volume.",
  },
];

export const trustBadges: TrustBadgeItem[] = [
  {
    id: "authentic-craft",
    label: "Authentic Craftsmanship",
    description: "Hand-finished embroidery by Afghan artisans.",
  },
  {
    id: "tracked-shipping",
    label: "Tracked Shipping With Updates",
    description: "Reliable tracked delivery across the world.",
  },
  {
    id: "custom-orders",
    label: "Custom Orders Available on Request",
    description: "Need a custom fit? Order with our team.",
  },
];

const DEFAULT_PICKUP_ADDRESS = "260300 Writing Creek Cres Floor 1, Unit H31, Balzac, AB T4A 0X8";
const DEFAULT_PICKUP_PHONE_DISPLAY = "+1 (403) 465-0640";
const DEFAULT_PICKUP_PHONE_HREF = "+14034650640";
const DEFAULT_PICKUP_HOURS = ["Regular store hours are 11:00 AM - 6:00 PM."];
const DEFAULT_PICKUP_NOTE = "Bring your order confirmation email when you arrive for pickup.";

const parsePickupHours = (value: string | undefined) => {
  if (!value) {
    return DEFAULT_PICKUP_HOURS;
  }

  const parsed = value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_PICKUP_HOURS;
};

export const getStorePickupDetails = (): StorePickupDetails => {
  const address = (import.meta.env.VITE_STORE_PICKUP_ADDRESS as string | undefined)?.trim() || DEFAULT_PICKUP_ADDRESS;
  const phoneDisplay =
    (import.meta.env.VITE_STORE_PICKUP_PHONE_DISPLAY as string | undefined)?.trim() || DEFAULT_PICKUP_PHONE_DISPLAY;
  const phoneHref =
    (import.meta.env.VITE_STORE_PICKUP_PHONE_HREF as string | undefined)?.trim() || DEFAULT_PICKUP_PHONE_HREF;
  const hours = parsePickupHours(import.meta.env.VITE_STORE_PICKUP_HOURS as string | undefined);
  const note = (import.meta.env.VITE_STORE_PICKUP_NOTE as string | undefined)?.trim() || DEFAULT_PICKUP_NOTE;

  return {
    address,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    phoneDisplay,
    phoneHref,
    hours,
    note,
  };
};

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
