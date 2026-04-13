import { useEffect, useMemo, useRef, useState } from "react";
import { isInquiryOnlyProduct, type Product, products } from "@/features/catalog/data/products";
import { normalizeSearchText, normalizedTextMatchesQuery, scoreWeightedSearchDocument } from "@/lib/search";

const SEARCH_RESULTS_LIMIT = 8;
const TRENDING_PRODUCTS_LIMIT = 6;

const toTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const scoreProductSearchResult = (product: Product, normalizedQuery: string) =>
  scoreWeightedSearchDocument(
    {
      name: product.name,
      category: product.category,
      department: product.department,
      description: product.description,
      keywords: [product.fabric, product.colors.join(" "), product.tags.join(" ")].join(" "),
    },
    normalizedQuery,
  );

export const useNavbarSearch = ({ pathname, search }: { pathname: string; search: string }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedSearchQuery = normalizeSearchText(searchQuery.trim());

  const availableProducts = useMemo(
    () =>
      products
        .filter((product) => product.availability === "available" || isInquiryOnlyProduct(product))
        .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt)),
    [],
  );

  const matchingProducts = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return availableProducts
      .map((product) => ({
        product,
        score: scoreProductSearchResult(product, normalizedSearchQuery),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.product.popularity - a.product.popularity ||
          toTimestamp(b.product.createdAt) - toTimestamp(a.product.createdAt),
      )
      .slice(0, SEARCH_RESULTS_LIMIT)
      .map((entry) => entry.product);
  }, [availableProducts, normalizedSearchQuery]);

  const trendingProducts = useMemo(
    () =>
      [...availableProducts]
        .sort((a, b) => b.popularity - a.popularity || toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
        .slice(0, TRENDING_PRODUCTS_LIMIT),
    [availableProducts],
  );

  useEffect(() => {
    trendingProducts.slice(0, TRENDING_PRODUCTS_LIMIT).forEach((product) => {
      const image = new Image();
      image.src = product.image;
    });
  }, [trendingProducts]);

  const suggestionTerms = useMemo(() => {
    if (!normalizedSearchQuery) {
      return ["Women's", "Men's", "Bridal", "Party wear", "Handmade", "Formal"];
    }

    const departmentMatches = availableProducts
      .map((product) => product.department)
      .map((department) => (department === "women" ? "Women's" : department === "men" ? "Men's" : "Jewelry"))
      .filter((departmentLabel) =>
        normalizedTextMatchesQuery(normalizeSearchText(departmentLabel), normalizedSearchQuery),
      );

    const productNameMatches = availableProducts
      .map((product) => product.name)
      .filter((name) => normalizedTextMatchesQuery(normalizeSearchText(name), normalizedSearchQuery));

    const categoryMatches = availableProducts
      .map((product) => product.category)
      .filter((category) => normalizedTextMatchesQuery(normalizeSearchText(category), normalizedSearchQuery));

    const popularMatches = ["Women's", "Men's", "Bridal", "Party wear", "Handmade", "Formal"].filter((term) =>
      normalizedTextMatchesQuery(normalizeSearchText(term), normalizedSearchQuery),
    );

    return Array.from(
      new Set([...departmentMatches, ...productNameMatches, ...categoryMatches, ...popularMatches]),
    ).slice(0, SEARCH_RESULTS_LIMIT);
  }, [availableProducts, normalizedSearchQuery]);

  const activeDepartment = useMemo<"women" | "men" | "jewelry" | null>(() => {
    if (pathname.startsWith("/collection/")) {
      const routeDepartment = pathname.split("/")[2]?.trim().toLowerCase();
      if (routeDepartment === "women" || routeDepartment === "men" || routeDepartment === "jewelry") {
        return routeDepartment as "women" | "men" | "jewelry";
      }
    }

    const queryDepartment = new URLSearchParams(search).get("department")?.trim().toLowerCase();
    if (queryDepartment === "women" || queryDepartment === "men" || queryDepartment === "jewelry") {
      return queryDepartment as "women" | "men" | "jewelry";
    }

    return null;
  }, [pathname, search]);

  const isCollectionRoute = pathname.startsWith("/collection");
  const isWomensActive = isCollectionRoute && activeDepartment === "women";
  const isMensActive = isCollectionRoute && activeDepartment === "men";
  const isJewelryActive = isCollectionRoute && activeDepartment === "jewelry";

  return {
    searchInputRef,
    searchQuery,
    setSearchQuery,
    normalizedSearchQuery,
    matchingProducts,
    trendingProducts,
    suggestionTerms,
    isWomensActive,
    isMensActive,
    isJewelryActive,
    isAboutActive: pathname === "/about",
    isFaqActive: pathname === "/faq",
  };
};
