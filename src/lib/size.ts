export const STANDARD_SIZE_KEYS = [
  "small",
  "medium",
  "large",
  "x-large",
  "xx-large",
] as const;

export type StandardSizeKey = (typeof STANDARD_SIZE_KEYS)[number];

export const STANDARD_SIZE_LABELS: Record<StandardSizeKey, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  "x-large": "X-Large",
  "xx-large": "XX-Large",
};

const tokenizeSize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

export const normalizeToStandardSizeKey = (value: string): StandardSizeKey | null => {
  const compact = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (compact === "s" || compact === "small") {
    return "small";
  }
  if (compact === "m" || compact === "medium") {
    return "medium";
  }
  if (compact === "l" || compact === "large") {
    return "large";
  }
  if (compact === "xl" || compact === "xlarge" || compact === "extralarge") {
    return "x-large";
  }
  if (compact === "xxl" || compact === "xxlarge" || compact === "2xl" || compact === "doublexl") {
    return "xx-large";
  }

  const tokens = tokenizeSize(value);
  if (tokens.includes("small")) {
    return "small";
  }
  if (tokens.includes("medium")) {
    return "medium";
  }
  if (tokens.includes("large")) {
    const xCount = tokens.filter((token) => token === "x" || token === "extra").length;
    if (xCount >= 2) {
      return "xx-large";
    }
    if (xCount === 1) {
      return "x-large";
    }
    return "large";
  }

  return null;
};

export const standardSizeLabel = (key: StandardSizeKey) => STANDARD_SIZE_LABELS[key];

