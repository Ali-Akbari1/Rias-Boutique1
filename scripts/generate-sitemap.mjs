import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const productsPath = join(projectRoot, "src", "content", "products.json");
const routeManifestPath = join(projectRoot, "src", "features", "navigation", "route-manifest.data.json");
const sitemapPath = join(projectRoot, "public", "sitemap.xml");
const routeManifest = JSON.parse(readFileSync(routeManifestPath, "utf8"));
const siteUrl = (process.env.SITE_URL ?? routeManifest.siteUrl ?? "https://www.riasboutique.com").replace(/\/+$/, "");

const toIsoDate = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString().slice(0, 10);
};

const escapeXml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const rawProductContent = JSON.parse(readFileSync(productsPath, "utf8"));
const productRows = Array.isArray(rawProductContent.products) ? rawProductContent.products : [];

const productMap = new Map();
for (const product of productRows) {
  const idSource =
    typeof product?.id === "string" || typeof product?.id === "number"
      ? String(product.id)
      : typeof product?.slug === "string"
        ? product.slug
        : "";
  const id = idSource.trim();
  if (!id || productMap.has(id)) {
    continue;
  }

  productMap.set(id, {
    id,
    createdAt: toIsoDate(product?.createdAt),
  });
}

const utilityRoutes = Array.isArray(routeManifest.utilityRoutes) ? routeManifest.utilityRoutes : [];
const collectionDepartments = Array.isArray(routeManifest.collectionDepartments)
  ? routeManifest.collectionDepartments
  : [];

const collectionRoutes = collectionDepartments.map((department) => ({
  path: `/collection/${encodeURIComponent(String(department).trim())}`,
  changefreq: department === "jewelry" ? "weekly" : "daily",
  priority: department === "jewelry" ? "0.85" : "0.9",
}));

const productRoutes = [...productMap.values()].map((product) => ({
  path: `/products/${encodeURIComponent(product.id)}`,
  changefreq: "weekly",
  priority: "0.8",
  lastmod: product.createdAt ?? undefined,
}));

const allRoutes = [...utilityRoutes, ...collectionRoutes, ...productRoutes];

const urlNodes = allRoutes
  .map((route) => {
    const lastmodNode = route.lastmod ? `\n    <lastmod>${escapeXml(route.lastmod)}</lastmod>` : "";
    return [
      "  <url>",
      `    <loc>${escapeXml(`${siteUrl}${route.path}`)}</loc>`,
      `    <changefreq>${escapeXml(route.changefreq)}</changefreq>`,
      `    <priority>${escapeXml(route.priority)}</priority>${lastmodNode}`,
      "  </url>",
    ]
      .join("\n")
      .replace(/\n\n/g, "\n");
  })
  .join("\n");

const sitemapXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  urlNodes,
  "</urlset>",
  "",
].join("\n");

writeFileSync(sitemapPath, sitemapXml, "utf8");
console.log(`[sitemap] generated ${allRoutes.length} URLs -> ${sitemapPath}`);
