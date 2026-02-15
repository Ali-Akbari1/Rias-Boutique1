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

interface ProductContent {
  products: Array<Omit<Product, "stripePriceId"> & { stripePriceId?: string }>;
}

const env = import.meta.env as Record<string, string | undefined>;
const stripePrice = (productId: string) => env[`VITE_STRIPE_PRICE_${productId}`];

const productContent = rawProductContent as ProductContent;

export const products: Product[] = productContent.products.map((product) => ({
  ...product,
  stripePriceId: product.stripePriceId || stripePrice(product.id),
}));

export const getProductById = (id: string) => products.find((product) => product.id === id);

export const getProductBySlug = (slug: string) => products.find((product) => product.slug === slug);
