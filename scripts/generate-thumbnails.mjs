// Generates 800px-wide WebP thumbnails for product images referenced in products.json.
// Cards display these at ~360px, so the full 2400px uploads are only loaded on product pages.
// Output goes to public/thumbs (gitignored) and is regenerated on every build.
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(projectRoot, "public");
const THUMB_WIDTH = 800;
const WEBP_QUALITY = 78;

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch (error) {
  // Cards fall back to the original image when a thumbnail is missing, so never fail the build.
  console.warn(`[thumbnails] sharp unavailable, skipping: ${error instanceof Error ? error.message : error}`);
  process.exit(0);
}

const productsJson = readFileSync(join(projectRoot, "src", "content", "products.json"), "utf8");
const imagePaths = [...new Set(productsJson.match(/\/uploads\/[^"\r\n]+?\.(?:webp|jpe?g|png)/gi) ?? [])];

// Keep in sync with toThumbnailUrl in src/lib/image.ts.
const toThumbnailPath = (imagePath) => `/thumbs${imagePath.replace(/\.(?:webp|jpe?g|png)$/i, ".webp")}`;

let generated = 0;
let skipped = 0;
let failed = 0;

for (const imagePath of imagePaths) {
  const sourceFile = join(publicDir, imagePath);
  const targetFile = join(publicDir, toThumbnailPath(imagePath));
  if (!existsSync(sourceFile)) {
    failed += 1;
    console.warn(`[thumbnails] missing source ${imagePath}`);
    continue;
  }
  if (existsSync(targetFile) && statSync(targetFile).mtimeMs >= statSync(sourceFile).mtimeMs) {
    skipped += 1;
    continue;
  }

  try {
    mkdirSync(dirname(targetFile), { recursive: true });
    await sharp(sourceFile, { failOn: "none" })
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(targetFile);
    generated += 1;
  } catch (error) {
    failed += 1;
    console.warn(`[thumbnails] failed ${imagePath}: ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`[thumbnails] generated ${generated}, up to date ${skipped}, failed ${failed}`);
