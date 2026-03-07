import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const PROJECT_ROOT = process.cwd();
const UPLOADS_DIR = path.join(PROJECT_ROOT, "public", "uploads");
const SEARCH_DIRS = ["src", "public", "api", "server", "data"];
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".html",
  ".css",
  ".txt",
  ".sql",
]);
const OPTIMIZABLE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_FILE_SIZE_BYTES = 500 * 1024;
const INITIAL_MAX_WIDTH = 2400;
const MIN_WIDTH = 900;
const JPEG_START_QUALITY = 82;
const WEBP_START_QUALITY = 80;
const APPLY_CHANGES = process.argv.includes("--apply");
const execFileAsync = promisify(execFile);

const toRelativePath = (targetPath) => path.relative(PROJECT_ROOT, targetPath).replace(/\\/g, "/");

const shouldReadAsText = (fileName) => {
  const extension = path.extname(fileName).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) || fileName === ".env" || fileName.endsWith(".example");
};

const walkFiles = async (directoryPath) => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (entryPath === UPLOADS_DIR) {
        continue;
      }
      files.push(...(await walkFiles(entryPath)));
      continue;
    }

    files.push(entryPath);
  }

  return files;
};

const collectReferencedUploads = async () => {
  const referenced = new Set();

  for (const relativeDir of SEARCH_DIRS) {
    const directoryPath = path.join(PROJECT_ROOT, relativeDir);

    try {
      const files = await walkFiles(directoryPath);
      for (const filePath of files) {
        if (!shouldReadAsText(path.basename(filePath))) {
          continue;
        }

        try {
          const content = await fs.readFile(filePath, "utf8");
          for (const match of content.matchAll(/\/uploads\/([^"'`\s)<>,?#]+)/g)) {
            const uploadName = match[1]?.trim();
            if (uploadName) {
              referenced.add(uploadName);
            }
          }
        } catch {
          // Ignore binary or unreadable files outside the uploads directory.
        }
      }
    } catch {
      // Skip missing directories.
    }
  }

  return referenced;
};

const buildOptimizedBuffer = async (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (!OPTIMIZABLE_EXTENSIONS.has(extension)) {
    return null;
  }

  const sourceBuffer = await fs.readFile(filePath);
  const metadata = await sharp(sourceBuffer, { failOn: "none" }).metadata();
  let width = metadata.width ? Math.min(metadata.width, INITIAL_MAX_WIDTH) : INITIAL_MAX_WIDTH;
  let jpegQuality = JPEG_START_QUALITY;
  let webpQuality = WEBP_START_QUALITY;
  let bestBuffer = sourceBuffer;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pipeline = sharp(sourceBuffer, { failOn: "none" }).rotate().resize({
      width,
      withoutEnlargement: true,
    });

    let candidateBuffer;
    if (extension === ".jpg" || extension === ".jpeg") {
      candidateBuffer = await pipeline.jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
      jpegQuality = Math.max(50, jpegQuality - 6);
    } else if (extension === ".png") {
      candidateBuffer = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true }).toBuffer();
    } else {
      candidateBuffer = await pipeline.webp({ quality: webpQuality, effort: 6 }).toBuffer();
      webpQuality = Math.max(50, webpQuality - 6);
    }

    if (candidateBuffer.length < bestBuffer.length) {
      bestBuffer = candidateBuffer;
    }

    if (bestBuffer.length <= MAX_FILE_SIZE_BYTES || width <= MIN_WIDTH) {
      break;
    }

    width = Math.max(MIN_WIDTH, Math.round(width * 0.85));
  }

  return bestBuffer;
};

const replaceFileAtomically = async (filePath, buffer) => {
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, buffer);
  try {
    if (process.platform === "win32") {
      const escapePowerShellPath = (value) => value.replace(/'/g, "''");
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Copy-Item -LiteralPath '${escapePowerShellPath(tempPath)}' -Destination '${escapePowerShellPath(filePath)}' -Force`,
      ]);
    } else {
      await fs.copyFile(tempPath, filePath);
    }
  } finally {
    await fs.rm(tempPath, { force: true });
  }
};

const main = async () => {
  const referencedUploads = await collectReferencedUploads();
  const uploadEntries = await fs.readdir(UPLOADS_DIR, { withFileTypes: true });
  const uploadFiles = uploadEntries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(UPLOADS_DIR, entry.name));

  const orphanedFiles = uploadFiles.filter((filePath) => !referencedUploads.has(path.basename(filePath)));
  const retainedFiles = uploadFiles.filter((filePath) => referencedUploads.has(path.basename(filePath)));

  const deletedFiles = [];
  for (const filePath of orphanedFiles) {
    deletedFiles.push(toRelativePath(filePath));
    if (APPLY_CHANGES) {
      await fs.unlink(filePath);
    }
  }

  const optimizedFiles = [];
  const skippedLargeFiles = [];
  for (const filePath of retainedFiles) {
    const stats = await fs.stat(filePath);
    if (stats.size <= MAX_FILE_SIZE_BYTES) {
      continue;
    }

    const optimizedBuffer = await buildOptimizedBuffer(filePath);
    if (!optimizedBuffer || optimizedBuffer.length >= stats.size) {
      skippedLargeFiles.push({
        path: toRelativePath(filePath),
        originalBytes: stats.size,
      });
      continue;
    }

    optimizedFiles.push({
      path: toRelativePath(filePath),
      originalBytes: stats.size,
      optimizedBytes: optimizedBuffer.length,
    });

    if (APPLY_CHANGES) {
      await replaceFileAtomically(filePath, optimizedBuffer);
    }
  }

  console.log("");
  console.log(`[media:hygiene] mode: ${APPLY_CHANGES ? "apply" : "dry-run"}`);
  console.log(`[media:hygiene] referenced uploads: ${referencedUploads.size}`);
  console.log(`[media:hygiene] orphaned uploads: ${deletedFiles.length}`);
  console.log(`[media:hygiene] oversized retained uploads: ${optimizedFiles.length + skippedLargeFiles.length}`);
  console.log(`[media:hygiene] resized uploads: ${optimizedFiles.length}`);
  console.log(`[media:hygiene] unchanged oversized uploads: ${skippedLargeFiles.length}`);

  if (deletedFiles.length > 0) {
    console.log("");
    console.log("[media:hygiene] orphaned files");
    deletedFiles.forEach((filePath) => console.log(`  - ${filePath}`));
  }

  if (optimizedFiles.length > 0) {
    console.log("");
    console.log("[media:hygiene] resized files");
    optimizedFiles.forEach((file) => {
      console.log(`  - ${file.path} (${file.originalBytes} -> ${file.optimizedBytes} bytes)`);
    });
  }

  if (skippedLargeFiles.length > 0) {
    console.log("");
    console.log("[media:hygiene] unchanged oversized files");
    skippedLargeFiles.forEach((file) => {
      console.log(`  - ${file.path} (${file.originalBytes} bytes)`);
    });
  }
};

main().catch((error) => {
  console.error("[media:hygiene] unexpected failure");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
