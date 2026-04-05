import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const productsPath = join(projectRoot, "src", "content", "products.json");
const outputPath = join(projectRoot, "public", "local-inventory-feed.txt");

const DEFAULT_STORE_CODE = "5741454598";
const DEFAULT_CURRENCY = "CAD";

const storeCode =
  (process.env.LOCAL_INVENTORY_STORE_CODE ||
    process.env.MERCHANT_CENTER_STORE_CODE ||
    process.env.STORE_CODE ||
    DEFAULT_STORE_CODE).trim();
const currency = (process.env.MERCHANT_FEED_CURRENCY || DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY;

const rawProductContent = JSON.parse(readFileSync(productsPath, "utf8"));
const productRows = Array.isArray(rawProductContent.products) ? rawProductContent.products : [];

const toStringValue = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
};

const toNumber = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toStringValue(entry))
    .filter((entry) => entry.length > 0);
};

const slugify = (value) =>
  toStringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeAvailability = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value <= 0 ? "out_of_stock" : "in_stock";
  }

  const normalized = toStringValue(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (["sold_out", "out_of_stock", "unavailable"].includes(normalized)) {
    return "out_of_stock";
  }

  return "in_stock";
};

const getQuantity = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const normalized = toStringValue(value).toLowerCase();
  if (["sold_out", "out_of_stock", "unavailable"].includes(normalized)) {
    return 0;
  }
  return 1;
};

const formatPrice = (value, currencyCode) => `${Math.max(0, value).toFixed(2)} ${currencyCode}`;

const rows = [];
rows.push(["store_code", "id", "availability", "quantity", "price"].join("\t"));

for (let index = 0; index < productRows.length; index += 1) {
  const product = productRows[index];
  const baseId = toStringValue(product?.id) || toStringValue(product?.slug) || `product-${index + 1}`;
  const sizes = toStringArray(product?.sizes);
  const colors = toStringArray(product?.colors);
  const normalizedSizes = sizes.length > 0 ? sizes : ["One Size"];
  const normalizedColors = colors.length > 0 ? colors : ["Default"];
  const availability = normalizeAvailability(product?.availability ?? product?.inventory);
  const quantity = getQuantity(product?.inventory ?? product?.availability);
  const priceCad = toNumber(product?.price, 0);
  if (priceCad <= 0) {
    continue;
  }
  const formattedPrice = formatPrice(priceCad, currency);

  for (const size of normalizedSizes) {
    for (const color of normalizedColors) {
      const sizeSlug = slugify(size) || "one-size";
      const colorSlug = slugify(color) || "default";
      const variantId = `${baseId}-${sizeSlug}-${colorSlug}`;
      rows.push([storeCode, variantId, availability, String(quantity), formattedPrice].join("\t"));
    }
  }
}

writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf8");
console.log(`[local-inventory-feed] generated ${rows.length - 1} rows -> ${outputPath}`);
