const STRIP_DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const MULTISPACE_REGEX = /\s+/g;

const SEARCH_TERM_NORMALIZERS: Array<[RegExp, string]> = [
  [/\bmen'?s\b/g, "men"],
  [/\bwomen'?s\b/g, "women"],
];

export const normalizeSearchText = (value: string) => {
  let normalized = value
    .normalize("NFKD")
    .replace(STRIP_DIACRITICS_REGEX, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(NON_ALPHANUMERIC_REGEX, " ");

  for (const [pattern, replacement] of SEARCH_TERM_NORMALIZERS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.trim().replace(MULTISPACE_REGEX, " ");
};

const tokenizeNormalizedSearchText = (value: string) =>
  value
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

export const normalizedTextMatchesQuery = (normalizedHaystack: string, normalizedQuery: string) => {
  if (!normalizedQuery) {
    return true;
  }

  const haystackTokens = tokenizeNormalizedSearchText(normalizedHaystack);
  const queryTokens = tokenizeNormalizedSearchText(normalizedQuery);

  if (queryTokens.length === 0) {
    return true;
  }

  return queryTokens.every((queryToken) =>
    haystackTokens.some((haystackToken) => haystackToken === queryToken || haystackToken.startsWith(queryToken)),
  );
};

export const matchesNormalizedSearch = (haystack: string, query: string) => {
  return normalizedTextMatchesQuery(normalizeSearchText(haystack), normalizeSearchText(query));
};
