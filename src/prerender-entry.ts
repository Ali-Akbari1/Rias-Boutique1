// Build-time entry for scripts/prerender.mjs. Compiled with `vite build --ssr` so it shares
// aliases, env handling, and metadata logic with the browser bundle.
import { buildRouteHead, type RouteHead } from "@/features/navigation/route-head";
import { COLLECTION_DEPARTMENTS, UTILITY_ROUTE_ENTRIES } from "@/features/navigation/route-manifest";
import { products, type Product } from "@/features/catalog/data/products";

export { buildRouteHead };
export type { RouteHead };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const productPath = (product: Product) => `/products/${encodeURIComponent(product.id)}`;

export const getPrerenderPaths = (): string[] => {
  const paths = new Set<string>(UTILITY_ROUTE_ENTRIES.map((route) => route.path));
  for (const department of COLLECTION_DEPARTMENTS) {
    paths.add(`/collection/${department}`);
  }
  for (const product of products) {
    paths.add(productPath(product));
  }
  return [...paths];
};

const formatPrice = (product: Product) =>
  product.priceOnInquiry || product.price === null ? "Price on inquiry" : `$${product.price.toFixed(2)} CAD`;

const renderProductLinks = (items: Product[]) =>
  items.length === 0
    ? ""
    : `<ul>${items
        .map(
          (product) =>
            `<li><a href="${escapeHtml(productPath(product))}">${escapeHtml(product.name)}</a> - ${escapeHtml(formatPrice(product))}</li>`,
        )
        .join("")}</ul>`;

const siteNav = `<nav aria-label="Site"><a href="/">Home</a> | <a href="/collection/women">Women</a> | <a href="/collection/men">Men</a> | <a href="/collection/jewelry">Jewelry</a> | <a href="/about">About</a> | <a href="/location">Location</a> | <a href="/faq">FAQ</a></nav>`;

// Plain-HTML version of the page for crawlers that do not execute JavaScript. React replaces
// it on mount (createRoot().render), so it mirrors what users see rather than hiding anything.
export const renderFallbackBody = (head: RouteHead) => {
  const parts: string[] = [siteNav];
  const { canonicalPath, product } = head;

  if (product) {
    parts.push(
      `<h1>${escapeHtml(product.name)}</h1>`,
      `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" width="480" loading="eager" />`,
      `<p>${escapeHtml(formatPrice(product))}${product.availability === "sold_out" ? " - Sold out" : ""}</p>`,
      product.description ? `<p>${escapeHtml(product.description)}</p>` : "",
      product.fabric ? `<p>Fabric: ${escapeHtml(product.fabric)}</p>` : "",
    );
  } else if (canonicalPath.startsWith("/collection")) {
    const department = canonicalPath.split("/")[2];
    const items = department ? products.filter((item) => item.department === department) : products;
    parts.push(`<h1>${escapeHtml(head.title.split(" | ")[0])}</h1>`, `<p>${escapeHtml(head.description)}</p>`);
    parts.push(renderProductLinks(items));
  } else {
    const heading = canonicalPath === "/" ? "Ria's Boutique - Afghan Clothing & Dresses" : head.title.split(" | ")[0];
    parts.push(`<h1>${escapeHtml(heading)}</h1>`, `<p>${escapeHtml(head.description)}</p>`);
  }

  return `<div data-prerender-fallback>${parts.filter(Boolean).join("")}</div>`;
};
