const STRIP_DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const MULTISPACE_REGEX = /\s+/g;

const SEARCH_TERM_NORMALIZERS: Array<[RegExp, string]> = [
  [/\bmen'?s\b/g, "men"],
  [/\bwomen'?s\b/g, "women"],
];

const FIELD_WEIGHTS = {
  name: 1.0,
  category: 0.7,
  department: 0.2,
  description: 0.3,
  keywords: 0.1,
} as const;

const EXACT_MATCH_SCORE_MULTIPLIER = 100;
const PREFIX_MATCH_SCORE_MULTIPLIER = 20;
const CONTAINS_MATCH_SCORE_MULTIPLIER = 8;

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

const scoreTokenAgainstField = (fieldValue: string, fieldTokens: string[], queryToken: string) => {
  if (fieldTokens.some((token) => token === queryToken)) {
    return 1;
  }

  if (
    fieldTokens.some(
      (token) => token.startsWith(queryToken) || queryToken.startsWith(token),
    )
  ) {
    return 0.75;
  }

  if (fieldValue.includes(queryToken)) {
    return 0.5;
  }

  return 0;
};

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

export interface WeightedSearchDocument {
  name: string;
  category?: string;
  department?: string;
  description?: string;
  keywords?: string;
}

export const scoreWeightedSearchDocument = (
  document: WeightedSearchDocument,
  query: string,
) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const queryTokens = tokenizeNormalizedSearchText(normalizedQuery);
  if (queryTokens.length === 0) {
    return 0;
  }

  const normalizedFields = [
    {
      key: "name",
      value: normalizeSearchText(document.name),
      weight: FIELD_WEIGHTS.name,
    },
    {
      key: "category",
      value: normalizeSearchText(document.category ?? ""),
      weight: FIELD_WEIGHTS.category,
    },
    {
      key: "department",
      value: normalizeSearchText(document.department ?? ""),
      weight: FIELD_WEIGHTS.department,
    },
    {
      key: "description",
      value: normalizeSearchText(document.description ?? ""),
      weight: FIELD_WEIGHTS.description,
    },
    {
      key: "keywords",
      value: normalizeSearchText(document.keywords ?? ""),
      weight: FIELD_WEIGHTS.keywords,
    },
  ].map((field) => ({
    ...field,
    tokens: tokenizeNormalizedSearchText(field.value),
  }));

  let totalScore = 0;
  for (const queryToken of queryTokens) {
    let bestTokenScore = 0;

    for (const field of normalizedFields) {
      if (!field.value) {
        continue;
      }

      const baseTokenScore = scoreTokenAgainstField(field.value, field.tokens, queryToken);
      if (baseTokenScore === 0) {
        continue;
      }

      bestTokenScore = Math.max(bestTokenScore, baseTokenScore * field.weight);
    }

    // Require all query tokens to match at least one field.
    if (bestTokenScore === 0) {
      return 0;
    }

    totalScore += bestTokenScore;
  }

  for (const field of normalizedFields) {
    if (!field.value) {
      continue;
    }

    if (field.value === normalizedQuery) {
      totalScore += field.weight * EXACT_MATCH_SCORE_MULTIPLIER;
      continue;
    }

    if (field.value.startsWith(normalizedQuery)) {
      totalScore += field.weight * PREFIX_MATCH_SCORE_MULTIPLIER;
      continue;
    }

    if (field.value.includes(normalizedQuery)) {
      totalScore += field.weight * CONTAINS_MATCH_SCORE_MULTIPLIER;
    }
  }

  return totalScore;
};
