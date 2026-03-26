import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export interface CatalogProduct {
  id: string;
  name: string;
  priceMinor: number;
  availability: "available" | "sold_out";
  maxQuantity?: number;
  image?: string;
}

const productSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
  name: z.string().trim().min(1).max(180),
  image: z.string().trim().optional(),
  price: z
    .union([z.number(), z.string()])
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value >= 0, "price must be a non-negative number"),
  // Kept as "inventory" to support Decap CMS schema and legacy numeric values.
  inventory: z.union([z.number(), z.string(), z.null(), z.undefined()]).optional(),
  availability: z.string().optional(),
  maxQuantity: z.union([z.number(), z.string(), z.null(), z.undefined()]).optional(),
});

const contentSchema = z.object({
  products: z.array(productSchema).default([]),
});

let cache: {
  loadedAt: number;
  products: CatalogProduct[];
} | null = null;

const CACHE_TTL_MS = 10_000;

const catalogPath = path.resolve(process.cwd(), "src", "content", "products.json");

const normalizeAvailability = (value: unknown): "available" | "sold_out" => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value <= 0 ? "sold_out" : "available";
  }

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["sold_out", "out_of_stock", "unavailable"].includes(normalized)) {
    return "sold_out";
  }

  if (["available", "in_stock"].includes(normalized)) {
    return "available";
  }

  return "available";
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

export const loadCatalog = async () => {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.products;
  }

  const raw = await readFile(catalogPath, "utf8");
  const parsed = contentSchema.parse(JSON.parse(raw));
  const uniqueIds = new Set<string>();

  const products: CatalogProduct[] = parsed.products.map((product) => {
    const id = product.id.trim();
    if (!id) {
      throw new Error("Product catalog contains an empty product id.");
    }

    if (uniqueIds.has(id)) {
      throw new Error(`Product catalog contains duplicate product id: ${id}`);
    }
    uniqueIds.add(id);

    return {
      id,
      name: product.name,
      image: product.image,
      priceMinor: Math.round(product.price * 100),
      availability: normalizeAvailability(product.availability ?? product.inventory),
      maxQuantity: normalizeMaxQuantity(product.maxQuantity),
    };
  });

  cache = { loadedAt: Date.now(), products };
  return products;
};

export const getCatalogMap = async () => {
  const products = await loadCatalog();
  const byId = new Map<string, CatalogProduct>();
  for (const product of products) {
    byId.set(product.id, product);
  }
  return byId;
};
