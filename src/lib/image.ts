import type { SyntheticEvent } from "react";

// Keep in sync with toThumbnailPath in scripts/generate-thumbnails.mjs.
export const toThumbnailUrl = (src: string) =>
  /^\/uploads\/.+\.(?:webp|jpe?g|png)$/i.test(src) ? `/thumbs${src.replace(/\.(?:webp|jpe?g|png)$/i, ".webp")}` : src;

// Falls back to the full-size image if a thumbnail was not generated (e.g. a fresh CMS upload in dev).
export const fallbackToOriginalImage = (original: string) => (event: SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.dataset.thumbnailFallback) {
    return;
  }
  image.dataset.thumbnailFallback = "true";
  image.src = original;
};
