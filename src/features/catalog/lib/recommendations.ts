import {
  isInquiryOnlyProduct,
  isPurchasableProduct,
  products,
  type Product,
} from "@/features/catalog/data/products";

const normalizeToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const uniqueTokens = (values: string[]) => Array.from(new Set(values.map(normalizeToken).filter(Boolean)));

const getProductTags = (product: Product) =>
  uniqueTokens([
    ...product.tags,
    ...product.colors,
    product.fabric,
    product.category,
    product.department,
  ]);

const getTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isDiscoverableRecommendation = (product: Product) =>
  product.availability === "available" || isInquiryOnlyProduct(product);

const scoreProductSimilarity = (source: Product, candidate: Product) => {
  const sourceTags = new Set(getProductTags(source));
  const candidateTags = getProductTags(candidate);
  const sharedTagCount = candidateTags.reduce((count, tag) => count + (sourceTags.has(tag) ? 1 : 0), 0);
  const sameCategory = normalizeToken(source.category) === normalizeToken(candidate.category);
  const sameDepartment = source.department === candidate.department;
  const recencyBoost = Math.max(0, getTimestamp(candidate.createdAt) / 1_000_000_000_000);

  return (
    (sameCategory ? 70 : 0) +
    sharedTagCount * 20 +
    (sameDepartment ? 8 : 0) +
    (candidate.availability === "available" ? 6 : 0) +
    (isInquiryOnlyProduct(candidate) ? 2 : 5) +
    candidate.popularity * 0.18 +
    recencyBoost
  );
};

export const getSimilarProducts = (
  sourceProduct: Product,
  {
    limit = 6,
    catalog = products,
    excludeIds = [],
    purchasableOnly = false,
  }: {
    limit?: number;
    catalog?: Product[];
    excludeIds?: string[];
    purchasableOnly?: boolean;
  } = {},
) => {
  const excluded = new Set([sourceProduct.id, ...excludeIds]);

  return catalog
    .filter((candidate) => !excluded.has(candidate.id))
    .filter((candidate) => (purchasableOnly ? isPurchasableProduct(candidate) : isDiscoverableRecommendation(candidate)))
    .map((candidate) => ({
      product: candidate,
      score: scoreProductSimilarity(sourceProduct, candidate),
    }))
    .filter(({ score, product }) => score > 0 && (product.department === sourceProduct.department || score >= 70))
    .sort((a, b) => b.score - a.score || b.product.popularity - a.product.popularity)
    .slice(0, limit)
    .map(({ product }) => product);
};

export const getCartRecommendations = (
  cartProducts: Product[],
  {
    limit = 4,
    catalog = products,
  }: {
    limit?: number;
    catalog?: Product[];
  } = {},
) => {
  const cartIds = new Set(cartProducts.map((product) => product.id));
  if (cartIds.size === 0) {
    return catalog
      .filter((product) => isPurchasableProduct(product))
      .sort((a, b) => b.popularity - a.popularity || getTimestamp(b.createdAt) - getTimestamp(a.createdAt))
      .slice(0, limit);
  }

  const categoryWeights = new Map<string, number>();
  const departmentWeights = new Map<string, number>();
  const tagWeights = new Map<string, number>();

  for (const product of cartProducts) {
    const categoryKey = normalizeToken(product.category);
    categoryWeights.set(categoryKey, (categoryWeights.get(categoryKey) || 0) + 1);
    departmentWeights.set(product.department, (departmentWeights.get(product.department) || 0) + 1);

    for (const tag of getProductTags(product)) {
      tagWeights.set(tag, (tagWeights.get(tag) || 0) + 1);
    }
  }

  return catalog
    .filter((product) => !cartIds.has(product.id))
    .filter((product) => isPurchasableProduct(product))
    .map((product) => {
      const sharedTags = getProductTags(product).reduce((count, tag) => count + (tagWeights.get(tag) || 0), 0);
      const categoryScore = (categoryWeights.get(normalizeToken(product.category)) || 0) * 42;
      const departmentScore = (departmentWeights.get(product.department) || 0) * 8;

      return {
        product,
        score: categoryScore + departmentScore + sharedTags * 14 + product.popularity * 0.2,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.product.popularity - a.product.popularity)
    .slice(0, limit)
    .map(({ product }) => product);
};
