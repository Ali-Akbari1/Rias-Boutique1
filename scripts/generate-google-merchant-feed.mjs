import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");

const productsPath = join(projectRoot, "src", "content", "products.json");
const routeManifestPath = join(projectRoot, "src", "features", "navigation", "route-manifest.data.json");
const outputPath = join(projectRoot, "public", "google-merchant-feed.xml");

const DEFAULT_SITE_URL = "https://www.riasboutique.com";
const DEFAULT_BRAND = "Ria's Boutique";
const DEFAULT_CURRENCY = "CAD";
const DEFAULT_SHIPPING_COUNTRY = "CA";
const DEFAULT_SHIPPING_SERVICE = "Standard";
const DEFAULT_SHIPPING_PRICE = 30;

const routeManifest = JSON.parse(readFileSync(routeManifestPath, "utf8"));
const siteUrl = (process.env.SITE_URL ?? routeManifest.siteUrl ?? DEFAULT_SITE_URL).replace(/\/+$/, "");
const brand = (process.env.MERCHANT_FEED_BRAND || DEFAULT_BRAND).trim() || DEFAULT_BRAND;
const currency = ((process.env.MERCHANT_FEED_CURRENCY || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY).toUpperCase();
const shippingCountry =
  ((process.env.MERCHANT_FEED_SHIPPING_COUNTRY || DEFAULT_SHIPPING_COUNTRY).trim() || DEFAULT_SHIPPING_COUNTRY)
    .toUpperCase();
const shippingService =
  (process.env.MERCHANT_FEED_SHIPPING_SERVICE || DEFAULT_SHIPPING_SERVICE).trim() || DEFAULT_SHIPPING_SERVICE;

const rawProductContent = JSON.parse(readFileSync(productsPath, "utf8"));
const productRows = Array.isArray(rawProductContent.products) ? rawProductContent.products : [];

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

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

const shippingPriceValue = Math.max(0, toNumber(process.env.MERCHANT_FEED_SHIPPING_PRICE, DEFAULT_SHIPPING_PRICE));

const toStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toStringValue(entry))
    .filter((entry) => entry.length > 0);
};

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

const normalizeGender = (value) => {
  const normalized = toStringValue(value).toLowerCase().replace(/[^a-z]+/g, "");
  if (["women", "womens", "woman", "female", "ladies", "lady"].includes(normalized)) {
    return "female";
  }
  if (["men", "mens", "man", "male", "gents", "gentlemen"].includes(normalized)) {
    return "male";
  }
  return "unisex";
};

const slugify = (value) =>
  toStringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toAbsoluteUrl = (value, fallbackPath = "/") => {
  const trimmed = toStringValue(value);
  if (!trimmed) {
    return `${siteUrl}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${siteUrl}${normalizedPath}`;
};

const formatPrice = (value) => `${Math.max(0, value).toFixed(2)} ${currency}`;

const productVariants = [];
const skippedProducts = [];

for (let index = 0; index < productRows.length; index += 1) {
  const product = productRows[index];
  const baseId = toStringValue(product?.id) || toStringValue(product?.slug) || `product-${index + 1}`;
  const title = toStringValue(product?.name) || baseId;
  const description = toStringValue(product?.description) || title;
  const productType = toStringValue(product?.category) || "Fashion";
  const department = toStringValue(product?.department);
  const gender = normalizeGender(department || productType);
  const availability = normalizeAvailability(product?.availability ?? product?.inventory);

  const price = toNumber(product?.price, 0);
  if (price <= 0) {
    skippedProducts.push({ id: baseId, reason: "non-positive price" });
    continue;
  }

  const compareAtPrice = toNumber(product?.compareAtPrice, 0);
  const hasSalePrice = compareAtPrice > price;
  const regularPrice = hasSalePrice ? compareAtPrice : price;

  const primaryImage =
    toStringValue(product?.image) ||
    toStringArray(product?.galleryImages)[0] ||
    "/placeholder.svg";
  const galleryImages = toStringArray(product?.galleryImages).filter((image) => image !== primaryImage);

  const sizes = toStringArray(product?.sizes);
  const colors = toStringArray(product?.colors);
  const normalizedSizes = sizes.length > 0 ? sizes : ["One Size"];
  const normalizedColors = colors.length > 0 ? colors : ["Default"];

  for (const size of normalizedSizes) {
    for (const color of normalizedColors) {
      const sizeSlug = slugify(size) || "one-size";
      const colorSlug = slugify(color) || "default";
      const variantId = `${baseId}-${sizeSlug}-${colorSlug}`;

      productVariants.push({
        id: variantId,
        itemGroupId: baseId,
        title,
        description,
        link: `${siteUrl}/products/${encodeURIComponent(baseId)}`,
        imageLink: toAbsoluteUrl(primaryImage, "/placeholder.svg"),
        additionalImageLinks: galleryImages.map((image) => toAbsoluteUrl(image, "/placeholder.svg")),
        availability,
        price: formatPrice(regularPrice),
        salePrice: hasSalePrice ? formatPrice(price) : "",
        productType,
        brand,
        gender,
        ageGroup: "adult",
        color,
        size,
        shippingCountry,
        shippingService,
        shippingPrice: formatPrice(shippingPriceValue),
      });
    }
  }
}

const toItemXml = (variant) => {
  const colorNode =
    variant.color && variant.color.toLowerCase() !== "default"
      ? `    <g:color>${escapeXml(variant.color)}</g:color>\n`
      : "";
  const sizeNode =
    variant.size && variant.size.toLowerCase() !== "one size"
      ? `    <g:size>${escapeXml(variant.size)}</g:size>\n`
      : "";
  const salePriceNode = variant.salePrice ? `    <g:sale_price>${escapeXml(variant.salePrice)}</g:sale_price>\n` : "";
  const additionalImageNodes = variant.additionalImageLinks
    .map((imageUrl) => `    <g:additional_image_link>${escapeXml(imageUrl)}</g:additional_image_link>`)
    .join("\n");
  const additionalImageBlock = additionalImageNodes ? `${additionalImageNodes}\n` : "";
  const shippingNode = [
    "    <g:shipping>",
    `      <g:country>${escapeXml(variant.shippingCountry)}</g:country>`,
    `      <g:service>${escapeXml(variant.shippingService)}</g:service>`,
    `      <g:price>${escapeXml(variant.shippingPrice)}</g:price>`,
    "    </g:shipping>",
  ].join("\n");

  return [
    "  <item>",
    `    <g:id>${escapeXml(variant.id)}</g:id>`,
    `    <g:item_group_id>${escapeXml(variant.itemGroupId)}</g:item_group_id>`,
    `    <title>${escapeXml(variant.title)}</title>`,
    `    <description>${escapeXml(variant.description)}</description>`,
    `    <link>${escapeXml(variant.link)}</link>`,
    `    <g:image_link>${escapeXml(variant.imageLink)}</g:image_link>`,
    additionalImageBlock.trimEnd(),
    `    <g:availability>${escapeXml(variant.availability)}</g:availability>`,
    `    <g:price>${escapeXml(variant.price)}</g:price>`,
    salePriceNode.trimEnd(),
    "    <g:condition>new</g:condition>",
    `    <g:brand>${escapeXml(variant.brand)}</g:brand>`,
    "    <g:identifier_exists>no</g:identifier_exists>",
    `    <g:product_type>${escapeXml(variant.productType)}</g:product_type>`,
    "    <g:google_product_category>Apparel &amp; Accessories</g:google_product_category>",
    `    <g:gender>${escapeXml(variant.gender)}</g:gender>`,
    `    <g:age_group>${escapeXml(variant.ageGroup)}</g:age_group>`,
    shippingNode,
    colorNode.trimEnd(),
    sizeNode.trimEnd(),
    "  </item>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

const itemNodes = productVariants.map(toItemXml).join("\n");

const feedXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
  "<channel>",
  "  <title>Ria&apos;s Boutique Product Feed</title>",
  `  <link>${escapeXml(`${siteUrl}/`)}</link>`,
  "  <description>Google Merchant Center feed generated from src/content/products.json.</description>",
  itemNodes,
  "</channel>",
  "</rss>",
  "",
].join("\n");

writeFileSync(outputPath, feedXml, "utf8");

console.log(`[merchant-feed] generated ${productVariants.length} item variants -> ${outputPath}`);
if (skippedProducts.length > 0) {
  console.warn(
    `[merchant-feed] skipped ${skippedProducts.length} product(s) with invalid price: ${skippedProducts
      .map((entry) => entry.id)
      .join(", ")}`,
  );
}
