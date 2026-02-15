import rawProductContent from "@/content/products.json";

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

interface RawProduct {
  id?: string | number;
  slug?: string;
  name?: string;
  price?: number | string;
  image?: string;
  galleryImages?: string[];
  category?: string;
  description?: string;
  stripePriceId?: string;
  sizes?: string[];
  colors?: string[];
  fabric?: string;
  fitInfo?: string;
  careInstructions?: string[];
  deliveryEstimate?: string;
  popularity?: number | string;
  createdAt?: string;
}

interface ProductContent {
  products?: RawProduct[];
}

const env = import.meta.env as Record<string, string | undefined>;
const stripePrice = (productId: string) => env[`VITE_STRIPE_PRICE_${productId}`];

const productContent = rawProductContent as ProductContent;

const getString = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
};

const getStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => getString(item))
    .filter((item) => item.length > 0);
};

const getNumber = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeProduct = (product: RawProduct, index: number): Product => {
  const name = getString(product.name) || `Product ${index + 1}`;
  const id = getString(product.id) || getString(product.slug) || String(index + 1);
  const slug = getString(product.slug) || slugify(name) || `product-${id}`;
  const image = getString(product.image) || "/placeholder.svg";
  const galleryImages = getStringArray(product.galleryImages);
  const sizes = getStringArray(product.sizes);
  const colors = getStringArray(product.colors);
  const careInstructions = getStringArray(product.careInstructions);
  const createdAt = getString(product.createdAt) || new Date().toISOString().slice(0, 10);

  return {
    id,
    slug,
    name,
    price: Math.max(0, getNumber(product.price, 0)),
    image,
    galleryImages: galleryImages.length > 0 ? galleryImages : [image],
    category: getString(product.category) || "Formal",
    description: getString(product.description),
    stripePriceId: getString(product.stripePriceId) || stripePrice(id),
    sizes: sizes.length > 0 ? sizes : ["One Size"],
    colors: colors.length > 0 ? colors : ["Default"],
    fabric: getString(product.fabric) || "Details coming soon.",
    fitInfo: getString(product.fitInfo) || "Fit details coming soon.",
    careInstructions:
      careInstructions.length > 0 ? careInstructions : ["Care instructions available upon request."],
    deliveryEstimate: getString(product.deliveryEstimate) || "Delivery estimate provided at checkout.",
    popularity: Math.min(100, Math.max(0, getNumber(product.popularity, 0))),
    createdAt,
  };
};

export const products: Product[] = (productContent.products ?? []).map(normalizeProduct);

export const getProductById = (id: string) => products.find((product) => product.id === id);

export const getProductBySlug = (slug: string) => products.find((product) => product.slug === slug);
