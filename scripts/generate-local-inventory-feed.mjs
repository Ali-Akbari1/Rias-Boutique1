import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const productsPath = join(projectRoot, "src", "content", "products.json");
const outputPath = join(projectRoot, "public", "local-inventory-feed.txt");

// Default to the currently linked Business Profile store code.
// LOCAL_INVENTORY_STORE_CODE should override this if the store code changes.
const DEFAULT_STORE_CODE = "16335217184145401742";
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

const toBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0;
  }

  const normalized = toStringValue(value).toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
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

const formatPrice = (value, currencyCode) => `${Math.max(0, value).toFixed(2)} ${currencyCode}`;

const rows = [];
rows.push(["store_code", "id", "availability", "price"].join("\t"));

for (let index = 0; index < productRows.length; index += 1) {
  const product = productRows[index];
  const baseId = toStringValue(product?.id) || toStringValue(product?.slug) || `product-${index + 1}`;
  const sizes = toStringArray(product?.sizes);
  const colors = toStringArray(product?.colors);
  const normalizedSizes = sizes.length > 0 ? sizes : ["One Size"];
  const normalizedColors = colors.length > 0 ? colors : ["Default"];
  const availability = normalizeAvailability(product?.availability ?? product?.inventory);
  const priceOnInquiry = toBoolean(product?.priceOnInquiry ?? product?.price_on_inquiry);
  if (priceOnInquiry) {
    continue;
  }
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
      rows.push([storeCode, variantId, availability, formattedPrice].join("\t"));
    }
  }
}

writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf8");
console.log(`[local-inventory-feed] generated ${rows.length - 1} rows -> ${outputPath}`);
