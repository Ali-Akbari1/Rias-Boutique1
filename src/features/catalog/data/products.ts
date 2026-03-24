import rawProductContent from "@/content/products.json";

export const PRODUCT_DEPARTMENTS = ["women", "men", "jewelry"] as const;
export type ProductDepartment = (typeof PRODUCT_DEPARTMENTS)[number];

export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  maxQuantity?: number;
  compareAtPrice?: number;
  salePercent?: number;
  department: ProductDepartment;
  image: string;
  galleryImages: string[];
  category: string;
  description: string;
  availability: "available" | "sold_out";
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
  maxQuantity?: number | string | null;
  image?: string;
  galleryImages?: string[];
  category?: string;
  department?: string;
  description?: string;
  inventory?: number | string | null;
  availability?: string;
  sizes?: string[];
  colors?: string[];
  fabric?: string;
  fitInfo?: string;
  careInstructions?: string[];
  deliveryEstimate?: string;
  popularity?: number | string;
  createdAt?: string;
  compareAtPrice?: number | string;
  salePercent?: number | string;
}

interface ProductContent {
  products?: RawProduct[];
}

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

const getObjectValueString = (value: unknown, preferredKeys: string[]) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const record = value as Record<string, unknown>;

  for (const key of preferredKeys) {
    const preferredValue = getString(record[key]);
    if (preferredValue) {
      return preferredValue;
    }
  }

  for (const entry of Object.values(record)) {
    const fallbackValue = getString(entry);
    if (fallbackValue) {
      return fallbackValue;
    }
  }

  return "";
};

const getStringArray = (value: unknown, preferredKeys: string[] = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const directValue = getString(item);
      if (directValue) {
        return directValue;
      }

      return getObjectValueString(item, preferredKeys);
    })
    .filter((item) => item.length > 0);
};

const getNumber = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMaxQuantity = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.floor(parsed));
};

const normalizeAvailability = (value: unknown): "available" | "sold_out" => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value <= 0 ? "sold_out" : "available";
  }

  const normalized = getString(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) {
    return "available";
  }

  if (["sold_out", "out_of_stock", "unavailable"].includes(normalized)) {
    return "sold_out";
  }

  if (["available", "in_stock"].includes(normalized)) {
    return "available";
  }

  return "available";
};

const normalizeDepartment = (value: unknown, fallbackCategory: string): ProductDepartment => {
  const normalized = getString(value).toLowerCase().replace(/[^a-z]+/g, "");

  if (["men", "mens", "man", "male", "gents", "gentlemen"].includes(normalized)) {
    return "men";
  }

  if (["jewelry", "jewellery", "accessory", "accessories"].includes(normalized)) {
    return "jewelry";
  }

  if (["women", "womens", "woman", "female", "ladies", "lady"].includes(normalized)) {
    return "women";
  }

  const fallback = fallbackCategory.toLowerCase();
  if (fallback.includes("men")) {
    return "men";
  }
  if (fallback.includes("jewel") || fallback.includes("accessor")) {
    return "jewelry";
  }

  return "women";
};

const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;

const normalizeSaleData = (
  price: number,
  salePercentValue: unknown,
  compareAtPriceValue: unknown,
): { salePercent?: number; compareAtPrice?: number } => {
  if (price <= 0) {
    return {};
  }

  let normalizedSalePercent = Math.round(getNumber(salePercentValue, 0));
  let normalizedCompareAtPrice = roundToTwoDecimals(getNumber(compareAtPriceValue, 0));

  if (
    normalizedSalePercent > 0 &&
    normalizedSalePercent < 100 &&
    normalizedCompareAtPrice <= price
  ) {
    normalizedCompareAtPrice = roundToTwoDecimals(price / (1 - normalizedSalePercent / 100));
  }

  if (normalizedSalePercent <= 0 && normalizedCompareAtPrice > price) {
    normalizedSalePercent = Math.round(
      ((normalizedCompareAtPrice - price) / normalizedCompareAtPrice) * 100,
    );
  }

  if (
    normalizedSalePercent <= 0 ||
    normalizedSalePercent >= 100 ||
    normalizedCompareAtPrice <= price
  ) {
    return {};
  }

  return {
    salePercent: normalizedSalePercent,
    compareAtPrice: normalizedCompareAtPrice,
  };
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
  const galleryImages = getStringArray(product.galleryImages, ["image", "src", "url"]);
  const sizes = getStringArray(product.sizes, ["size", "label", "value"]);
  const colors = getStringArray(product.colors, ["color", "label", "value", "name"]);
  const careInstructions = getStringArray(product.careInstructions, ["instruction", "text", "value"]);
  const createdAt = getString(product.createdAt) || new Date().toISOString().slice(0, 10);
  const category = getString(product.category) || "Party Wear";
  const department = normalizeDepartment(product.department, category);
  const availability = normalizeAvailability(product.availability ?? product.inventory);
  const price = Math.max(0, getNumber(product.price, 0));
  const maxQuantity = normalizeMaxQuantity(product.maxQuantity);
  const saleData = normalizeSaleData(price, product.salePercent, product.compareAtPrice);

  return {
    id,
    slug,
    name,
    price,
    maxQuantity,
    compareAtPrice: saleData.compareAtPrice,
    salePercent: saleData.salePercent,
    department,
    image,
    galleryImages: galleryImages.length > 0 ? galleryImages : [image],
    category,
    description: getString(product.description),
    availability,
    sizes: sizes.length > 0 ? sizes : ["One Size"],
    colors: colors.length > 0 ? colors : ["Default"],
    fabric: getString(product.fabric) || "Please contact us for detailed fabric information.",
    fitInfo: getString(product.fitInfo) || "Please contact us for detailed sizing and fit information.",
    careInstructions:
      careInstructions.length > 0 ? careInstructions : ["Care instructions available upon request."],
    deliveryEstimate: getString(product.deliveryEstimate) || "You will receive an estimated delivery date upon completing your order.",
    popularity: Math.min(100, Math.max(0, getNumber(product.popularity, 0))),
    createdAt,
  };
};

export const products: Product[] = (productContent.products ?? []).map(normalizeProduct);

export const getProductById = (id: string) => products.find((product) => product.id === id);

export const getProductBySlug = (slug: string) => products.find((product) => product.slug === slug);
