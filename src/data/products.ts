import product1 from "@/assets/product-1.jpg";
import product2 from "@/assets/product-2.jpg";
import product3 from "@/assets/product-3.jpg";
import product4 from "@/assets/product-4.jpg";
import product5 from "@/assets/product-5.jpg";
import product6 from "@/assets/product-6.jpg";

export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
  galleryImages: string[];
  category: string;
  description: string;
  stripePriceId?: string;
  sizes: string[];
  colors: string[];
  fabric: string;
  fitInfo: string;
  careInstructions: string[];
  deliveryEstimate: string;
  popularity: number;
  createdAt: string;
}

const env = import.meta.env as Record<string, string | undefined>;
const stripePrice = (productId: string) => env[`VITE_STRIPE_PRICE_${productId}`];

const standardCare = [
  "Dry clean recommended for best preservation of embroidery.",
  "Store in a breathable garment bag away from direct sunlight.",
  "Steam on low heat from the reverse side only.",
];

export const products: Product[] = [
  {
    id: "1",
    slug: "emerald-zarbaft-gown",
    name: "Emerald Zarbaft Gown",
    price: 289,
    image: product1,
    galleryImages: [product1, product4, product6],
    category: "Formal",
    description: "Luxurious green silk gown with traditional gold zarbaft embroidery, perfect for celebrations.",
    stripePriceId: stripePrice("1"),
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: ["Emerald", "Forest"],
    fabric: "Silk satin base with hand-worked zari embroidery.",
    fitInfo: "Tailored through the waist with a gentle A-line drape. True to size.",
    careInstructions: standardCare,
    deliveryEstimate: "Ships in 2-3 business days. Delivery in 5-8 business days in North America.",
    popularity: 93,
    createdAt: "2026-01-17",
  },
  {
    id: "2",
    slug: "burgundy-velvet-anarkali",
    name: "Burgundy Velvet Anarkali",
    price: 345,
    image: product2,
    galleryImages: [product2, product5, product3],
    category: "Bridal",
    description: "Rich burgundy velvet anarkali with intricate gold threadwork and bell sleeves.",
    stripePriceId: stripePrice("2"),
    sizes: ["S", "M", "L", "XL"],
    colors: ["Burgundy", "Maroon"],
    fabric: "Premium velvet with metallic thread detailing and satin lining.",
    fitInfo: "Relaxed through the skirt with fitted bodice. Size up if between sizes.",
    careInstructions: [
      "Professional dry clean only.",
      "Avoid folding heavy embellishment areas; hang when possible.",
      "Spot clean lining with a damp cloth only.",
    ],
    deliveryEstimate: "Ships in 3-4 business days. Delivery in 6-10 business days in North America.",
    popularity: 96,
    createdAt: "2025-12-11",
  },
  {
    id: "3",
    slug: "ivory-gold-bridal-set",
    name: "Ivory & Gold Bridal Set",
    price: 520,
    image: product3,
    galleryImages: [product3, product2, product1],
    category: "Bridal",
    description: "Stunning ivory bridal set with lavish gold beadwork and crystal embellishments.",
    stripePriceId: stripePrice("3"),
    sizes: ["S", "M", "L"],
    colors: ["Ivory Gold"],
    fabric: "Layered silk blend with beadwork, crystals, and hand-finished trims.",
    fitInfo: "Structured bodice with full-length flowing skirt. Runs slightly fitted in the bust.",
    careInstructions: [
      "Dry clean with bridal garment specialist only.",
      "Do not steam directly on embellishments.",
      "Lay flat while unpacking to avoid bead stress.",
    ],
    deliveryEstimate: "Ships in 4-5 business days. Delivery in 7-12 business days in North America.",
    popularity: 98,
    createdAt: "2026-02-06",
  },
  {
    id: "4",
    slug: "sapphire-silk-kaftan",
    name: "Sapphire Silk Kaftan",
    price: 265,
    image: product4,
    galleryImages: [product4, product1, product6],
    category: "Casual",
    description: "Elegant blue silk kaftan with delicate silver embroidery and mirror work.",
    stripePriceId: stripePrice("4"),
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: ["Sapphire", "Midnight Blue"],
    fabric: "Soft silk blend with hand-applied mirror accents.",
    fitInfo: "Relaxed kaftan silhouette with comfortable shoulder room.",
    careInstructions: standardCare,
    deliveryEstimate: "Ships in 1-2 business days. Delivery in 4-7 business days in North America.",
    popularity: 87,
    createdAt: "2025-10-04",
  },
  {
    id: "5",
    slug: "royal-magenta-chapan",
    name: "Royal Magenta Chapan",
    price: 310,
    image: product5,
    galleryImages: [product5, product2, product3],
    category: "Formal",
    description: "Traditional chapan in vibrant magenta with lavish gold zari embroidery.",
    stripePriceId: stripePrice("5"),
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["Magenta", "Ruby"],
    fabric: "Textured brocade with zari and cotton-silk inner lining.",
    fitInfo: "Slightly boxy traditional cut. Choose your regular size for intended fit.",
    careInstructions: [
      "Dry clean only.",
      "Store on broad hanger to retain shoulder shape.",
      "Avoid direct perfumes on zari areas.",
    ],
    deliveryEstimate: "Ships in 2-3 business days. Delivery in 5-9 business days in North America.",
    popularity: 91,
    createdAt: "2025-11-22",
  },
  {
    id: "6",
    slug: "noir-gold-evening-dress",
    name: "Noir Gold Evening Dress",
    price: 395,
    image: product6,
    galleryImages: [product6, product1, product4],
    category: "Formal",
    description: "Dramatic black evening dress with bold gold embroidery and flowing silhouette.",
    stripePriceId: stripePrice("6"),
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: ["Noir Gold", "Black Champagne"],
    fabric: "Matte crepe body with metallic thread embroidery.",
    fitInfo: "Skims the body through the top and flares from the hip.",
    careInstructions: standardCare,
    deliveryEstimate: "Ships in 2-3 business days. Delivery in 5-8 business days in North America.",
    popularity: 95,
    createdAt: "2026-01-30",
  },
];

export const getProductById = (id: string) => products.find((product) => product.id === id);

export const getProductBySlug = (slug: string) => products.find((product) => product.slug === slug);
