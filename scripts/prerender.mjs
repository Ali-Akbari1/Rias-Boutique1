// Writes a static HTML file per public route with route-specific <head> tags, JSON-LD, and a
// plain-HTML body, so crawlers and link previews that do not run JavaScript see real content.
// Also writes app.html (SPA shell for checkout/admin) and 404.html (served with a 404 status).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(projectRoot, "dist");
const ssrDir = join(projectRoot, "dist-ssr");

const { buildRouteHead, getPrerenderPaths, renderFallbackBody } = await import(
  pathToFileURL(join(ssrDir, "prerender-entry.js")).href
);

const template = readFileSync(join(distDir, "index.html"), "utf8");

const escapeAttr = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const setById = (html, id, attribute, value) => {
  const pattern = new RegExp(`(<[^>]*\\bid="${id}"[^>]*?\\b${attribute}=")[^"]*(")`);
  if (!pattern.test(html)) {
    throw new Error(`[prerender] template is missing #${id}`);
  }
  return html.replace(pattern, `$1${escapeAttr(value)}$2`);
};

const setTitle = (html, title) => html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`);

const fallbackStyle =
  "<style>[data-prerender-fallback]{max-width:64rem;margin:0 auto;padding:7rem 1rem 2rem;line-height:1.6}" +
  "[data-prerender-fallback] h1{font-size:2rem;margin:1rem 0}[data-prerender-fallback] img{max-width:100%;height:auto}</style>";

// The hero image is the home page's LCP element but is only requested once the JS bundle runs,
// so preload it from the HTML.
const heroImage = readdirSync(join(distDir, "assets")).find((file) => /^hero-bg-.*\.webp$/.test(file));
if (!heroImage) {
  console.warn("[prerender] hero image not found in dist/assets; home page will not preload it");
}
const heroPreload = heroImage
  ? `<link rel="preload" as="image" href="/assets/${heroImage}" fetchpriority="high" />`
  : "";

const renderRoute = (path) => {
  const head = buildRouteHead(path, "");
  let html = setTitle(template, head.title);
  html = setById(html, "rb-description", "content", head.description);
  html = setById(html, "rb-og-title", "content", head.title);
  html = setById(html, "rb-og-description", "content", head.description);
  html = setById(html, "rb-og-type", "content", head.ogType);
  html = setById(html, "rb-og-image", "content", head.ogImage);
  html = setById(html, "rb-og-image-alt", "content", head.ogImageAlt);
  html = setById(html, "rb-twitter-title", "content", head.title);
  html = setById(html, "rb-twitter-description", "content", head.description);
  html = setById(html, "rb-twitter-image", "content", head.ogImage);

  const canonical = escapeAttr(head.canonicalUrl);
  const jsonLd = JSON.stringify(head.jsonLd).replace(/</g, "\\u003c");
  const headTags = [
    `<link id="rb-canonical" rel="canonical" href="${canonical}" />`,
    `<link id="rb-alternate-en-ca" rel="alternate" href="${canonical}" hreflang="en-CA" />`,
    `<link id="rb-alternate-x-default" rel="alternate" href="${canonical}" hreflang="x-default" />`,
    `<meta id="rb-og-url" property="og:url" content="${canonical}" />`,
    `<script id="rb-jsonld" type="application/ld+json">${jsonLd}</script>`,
    fallbackStyle,
    path === "/" ? heroPreload : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  html = html.replace("</head>", `    ${headTags}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${renderFallbackBody(head)}</div>`);
  return html;
};

const toOutputFile = (path) =>
  path === "/" ? join(distDir, "index.html") : join(distDir, ...decodeURIComponent(path).split("/").filter(Boolean), "index.html");

const noindex = (html) => setById(html, "rb-robots", "content", "noindex,follow");

// Shells must be written before index.html is replaced with the prerendered home page.
writeFileSync(join(distDir, "app.html"), noindex(template));
writeFileSync(join(distDir, "404.html"), setTitle(noindex(template), "Page Not Found | Ria's Boutique"));

const paths = getPrerenderPaths();
const seenLowercase = new Map();
for (const path of paths) {
  // Vercel (Linux) keeps these apart; case-insensitive filesystems (Windows/macOS) overwrite one.
  const lowercase = path.toLowerCase();
  if (seenLowercase.has(lowercase)) {
    console.warn(`[prerender] ${path} differs from ${seenLowercase.get(lowercase)} only by case`);
  }
  seenLowercase.set(lowercase, path);

  const outputFile = toOutputFile(path);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, renderRoute(path));
}

rmSync(ssrDir, { recursive: true, force: true });
console.log(`[prerender] wrote ${paths.length} routes + app.html + 404.html`);
