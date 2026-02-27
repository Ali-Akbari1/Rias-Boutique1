import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PROJECT_ROOT = process.cwd();
const IMAGE_DIRS = ["public/uploads", "public/instagram", "src/assets"];
const CONVERTIBLE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const WEBP_QUALITY = 82;
const WEBP_EFFORT = 5;

const walkFiles = async (directoryPath) => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
      continue;
    }
    files.push(entryPath);
  }

  return files;
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const needsRebuild = async (sourcePath, targetPath) => {
  if (!(await fileExists(targetPath))) {
    return true;
  }

  const [sourceStats, targetStats] = await Promise.all([fs.stat(sourcePath), fs.stat(targetPath)]);
  return sourceStats.mtimeMs > targetStats.mtimeMs;
};

const toWebpPath = (imagePath) => imagePath.replace(/\.[^.]+$/i, ".webp");

const normalizePublicImageReferences = async () => {
  const productsJsonPath = path.join(PROJECT_ROOT, "src", "content", "products.json");
  const rawContent = await fs.readFile(productsJsonPath, "utf8");

  const normalizedContent = rawContent.replace(
    /(\/(?:uploads|instagram)\/[^"\r\n]+?)\.(?:jpe?g|png|heic|heif)/gi,
    (fullMatch, basePath) => {
      const webpPath = path.join(PROJECT_ROOT, "public", basePath.replace(/^\//, "") + ".webp");
      return existsSync(webpPath) ? `${basePath}.webp` : fullMatch;
    },
  );

  if (normalizedContent !== rawContent) {
    await fs.writeFile(productsJsonPath, normalizedContent, "utf8");
    return true;
  }

  return false;
};

const convertImage = async (sourcePath) => {
  const targetPath = toWebpPath(sourcePath);

  if (!(await needsRebuild(sourcePath, targetPath))) {
    return { status: "skipped", sourcePath, targetPath };
  }

  await sharp(sourcePath, { failOn: "none" })
    .rotate()
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toFile(targetPath);

  return { status: "converted", sourcePath, targetPath };
};

const main = async () => {
  const absoluteDirectories = IMAGE_DIRS.map((dir) => path.join(PROJECT_ROOT, dir));
  const existingDirectories = [];

  for (const directoryPath of absoluteDirectories) {
    if (await fileExists(directoryPath)) {
      existingDirectories.push(directoryPath);
    } else {
      console.warn(`[images:convert] skipped missing directory: ${path.relative(PROJECT_ROOT, directoryPath)}`);
    }
  }

  const allFiles = [];
  for (const directoryPath of existingDirectories) {
    allFiles.push(...(await walkFiles(directoryPath)));
  }

  const imageFiles = allFiles.filter((filePath) => CONVERTIBLE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));

  let convertedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const imagePath of imageFiles) {
    try {
      const result = await convertImage(imagePath);
      if (result.status === "converted") {
        convertedCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      console.error(`[images:convert] failed: ${path.relative(PROJECT_ROOT, imagePath)}`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  const referencesUpdated = await normalizePublicImageReferences();

  console.log("");
  console.log("[images:convert] complete");
  console.log(`  scanned: ${imageFiles.length}`);
  console.log(`  converted: ${convertedCount}`);
  console.log(`  skipped: ${skippedCount}`);
  console.log(`  failed: ${failedCount}`);
  console.log(`  product references updated: ${referencesUpdated ? "yes" : "no"}`);

  if (failedCount > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error("[images:convert] unexpected failure");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
