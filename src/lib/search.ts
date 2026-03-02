const STRIP_DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const MULTISPACE_REGEX = /\s+/g;

const SEARCH_TERM_NORMALIZERS: Array<[RegExp, string]> = [
  [/\bmen'?s\b/g, "men"],
  [/\bwomen'?s\b/g, "women"],
];

const FIELD_WEIGHTS = {
  name: 12,
  category: 7,
  department: 5,
  description: 2,
  keywords: 1,
} as const;

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
    return 3;
  }

  if (
    fieldTokens.some(
      (token) => token.startsWith(queryToken) || queryToken.startsWith(token),
    )
  ) {
    return 2;
  }

  if (fieldValue.includes(queryToken)) {
    return 1;
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
      value: normalizeSearchText(document.name),
      weight: FIELD_WEIGHTS.name,
    },
    {
      value: normalizeSearchText(document.category ?? ""),
      weight: FIELD_WEIGHTS.category,
    },
    {
      value: normalizeSearchText(document.department ?? ""),
      weight: FIELD_WEIGHTS.department,
    },
    {
      value: normalizeSearchText(document.description ?? ""),
      weight: FIELD_WEIGHTS.description,
    },
    {
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

  const normalizedName = normalizedFields[0].value;
  const normalizedCategory = normalizedFields[1].value;
  const normalizedDepartment = normalizedFields[2].value;

  if (normalizedName === normalizedQuery) {
    totalScore += 500;
  } else if (normalizedName.startsWith(normalizedQuery)) {
    totalScore += 260;
  } else if (normalizedName.includes(normalizedQuery)) {
    totalScore += 120;
  }

  if (normalizedCategory === normalizedQuery) {
    totalScore += 140;
  }

  if (normalizedDepartment === normalizedQuery) {
    totalScore += 90;
  }

  return totalScore;
};
