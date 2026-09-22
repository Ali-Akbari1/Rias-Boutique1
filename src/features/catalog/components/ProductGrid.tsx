import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import {
  hasDisplayPrice,
  isInquiryOnlyProduct,
  type ProductDepartment,
  PRODUCT_DEPARTMENTS,
  products,
} from "@/features/catalog/data/products";
import { useCurrency } from "@/features/currency/context/useCurrency";
import { consumePendingCollectionScrollPosition } from "@/lib/collection-scroll";
import ProductCard from "./ProductCard";
import { normalizeSearchText, scoreWeightedSearchDocument } from "@/lib/search";
import { normalizeToStandardSizeKey, STANDARD_SIZE_KEYS, standardSizeLabel } from "@/lib/size";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

type SortOption = "newest" | "alphabetical" | "price-low" | "price-high" | "popular";
type DepartmentOption = "all" | ProductDepartment;
type AvailabilityOption = "all" | "available" | "sold_out";
type SaleOption = "all" | "on-sale" | "regular-price";
type FacetOption = { value: string; label: string };
const SEARCH_DEBOUNCE_MS = 250;
const PRODUCTS_PER_PAGE = 21;

interface ProductGridProps {
  initialDepartment?: DepartmentOption;
  initialQuery?: string;
}

const DEPARTMENT_LABELS: Record<ProductDepartment, string> = {
  women: "Women",
  men: "Men",
  jewelry: "Jewelry",
};

const WOMEN_DEFAULT_CATEGORIES = ["Party Wear", "Bridal"];
const MEN_DEFAULT_CATEGORIES = ["Handmade", "Machine Made"];
const JEWELRY_DEFAULT_CATEGORIES = ["Artificial", "925 Silver"];
const ALL_DEFAULT_CATEGORIES = [
  ...WOMEN_DEFAULT_CATEGORIES,
  ...MEN_DEFAULT_CATEGORIES,
  ...JEWELRY_DEFAULT_CATEGORIES,
];
const HIDDEN_CATEGORY_KEYS = new Set(["formal"]);

const categoryKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const sizeKey = (value: string) =>
  normalizeToStandardSizeKey(value) ?? value.trim().toLowerCase().replace(/\s+/g, " ");

const toFacetOption = (label: string): FacetOption => ({
  value: categoryKey(label),
  label,
});

const parsePriceInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
};

const normalizeSearchParamsString = (params: URLSearchParams | string) => {
  const normalizedParams = new URLSearchParams(params);
  normalizedParams.delete("department");
  return normalizedParams.toString();
};

const scoreProductSearchMatch = (normalizedQuery: string, product: (typeof products)[number]) =>
  scoreWeightedSearchDocument(
    {
      name: product.name,
      category: product.category,
      department: product.department,
      description: product.description,
      keywords: [product.fabric, product.fitInfo, product.colors.join(" "), product.tags.join(" ")].join(" "),
    },
    normalizedQuery,
  );

const normalizeCollectionPath = (pathname: string) =>
  pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

const buildCollectionPath = (department: DepartmentOption) =>
  department === "all" ? "/collection" : `/collection/${department}`;

const getCollectionHeading = (department: DepartmentOption) => {
  if (department === "women") {
    return {
      title: "Women's Collection",
      subtitle: "Handcrafted Afghan dresses and styles for women.",
    };
  }

  if (department === "men") {
    return {
      title: "Men's Collection",
      subtitle: "Traditional Afghan clothing and tailored looks for men.",
    };
  }

  if (department === "jewelry") {
    return {
      title: "Jewelry Collection",
      subtitle: "Afghan-inspired jewelry and statement accessories.",
    };
  }

  return {
    title: "Our Collection",
    subtitle: "Handcrafted Afghan clothing and accessories.",
  };
};

const ProductGrid = ({ initialDepartment = "all", initialQuery = "" }: ProductGridProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const normalizedInitialQuery = initialQuery.trim();
  const initialCategory = searchParams.get("category")?.trim() || "all";
  const initialAvailability = searchParams.get("availability")?.trim() || "all";
  const initialSaleFilter = searchParams.get("sale")?.trim() || "all";
  const initialSize = searchParams.get("size")?.trim() || "all";
  const initialMinPrice = searchParams.get("min")?.trim() || "";
  const initialMaxPrice = searchParams.get("max")?.trim() || "";
  const initialSortBy = searchParams.get("sort")?.trim() || "newest";
  const [queryInput, setQueryInput] = useState(normalizedInitialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(normalizeSearchText(normalizedInitialQuery));
  const [department, setDepartment] = useState<DepartmentOption>(initialDepartment);
  const [category, setCategory] = useState(initialCategory);
  const [availability, setAvailability] = useState<AvailabilityOption>(
    initialAvailability === "available" || initialAvailability === "sold_out" ? initialAvailability : "all",
  );
  const [saleFilter, setSaleFilter] = useState<SaleOption>(
    initialSaleFilter === "on-sale" || initialSaleFilter === "regular-price" ? initialSaleFilter : "all",
  );
  const [size, setSize] = useState(initialSize);
  const [minPriceInput, setMinPriceInput] = useState(initialMinPrice);
  const [maxPriceInput, setMaxPriceInput] = useState(initialMaxPrice);
  const { currency, cadToUsdRate } = useCurrency();
  const [sortBy, setSortBy] = useState<SortOption>(
    initialSortBy === "alphabetical" ||
      initialSortBy === "price-low" ||
      initialSortBy === "price-high" ||
      initialSortBy === "popular"
      ? initialSortBy
      : "newest",
  );
  const [visibleProductCount, setVisibleProductCount] = useState(PRODUCTS_PER_PAGE);
  const didMountDepartmentResetEffectRef = useRef(false);
  const didMountSizeResetEffectRef = useRef(false);
  const isDepartmentUserDrivenRef = useRef(false);
  const lastInternalSearchQueryRef = useRef(normalizeSearchParamsString(searchParams));
  const isHydratingFromUrlRef = useRef(false);

  const departments = useMemo(() => ["all", ...PRODUCT_DEPARTMENTS] as DepartmentOption[], []);
  const minPrice = useMemo(() => parsePriceInput(minPriceInput), [minPriceInput]);
  const maxPrice = useMemo(() => parsePriceInput(maxPriceInput), [maxPriceInput]);
  const resolvedMinPrice = useMemo(() => {
    if (minPrice === null || maxPrice === null) {
      return minPrice;
    }
    return Math.min(minPrice, maxPrice);
  }, [maxPrice, minPrice]);
  const resolvedMaxPrice = useMemo(() => {
    if (minPrice === null || maxPrice === null) {
      return maxPrice;
    }
    return Math.max(minPrice, maxPrice);
  }, [maxPrice, minPrice]);

  const resolvedMinPriceCad = useMemo(() => {
    if (resolvedMinPrice === null) {
      return null;
    }
    return currency === "USD" ? resolvedMinPrice / cadToUsdRate : resolvedMinPrice;
  }, [cadToUsdRate, currency, resolvedMinPrice]);

  const resolvedMaxPriceCad = useMemo(() => {
    if (resolvedMaxPrice === null) {
      return null;
    }
    return currency === "USD" ? resolvedMaxPrice / cadToUsdRate : resolvedMaxPrice;
  }, [cadToUsdRate, currency, resolvedMaxPrice]);

  const setDepartmentFromUser = (value: DepartmentOption) => {
    isDepartmentUserDrivenRef.current = true;
    setDepartment(value);
  };

  useEffect(() => {
    isDepartmentUserDrivenRef.current = false;
    setDepartment(initialDepartment);
  }, [initialDepartment]);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setAvailability(initialAvailability === "available" || initialAvailability === "sold_out" ? initialAvailability : "all");
  }, [initialAvailability]);

  useEffect(() => {
    setSaleFilter(
      initialSaleFilter === "on-sale" || initialSaleFilter === "regular-price" ? initialSaleFilter : "all",
    );
  }, [initialSaleFilter]);

  useEffect(() => {
    setSize(initialSize);
  }, [initialSize]);

  useEffect(() => {
    setMinPriceInput(initialMinPrice);
  }, [initialMinPrice]);

  useEffect(() => {
    setMaxPriceInput(initialMaxPrice);
  }, [initialMaxPrice]);

  useEffect(() => {
    setSortBy(
      initialSortBy === "alphabetical" ||
        initialSortBy === "price-low" ||
        initialSortBy === "price-high" ||
        initialSortBy === "popular"
        ? initialSortBy
        : "newest",
    );
  }, [initialSortBy]);

  useEffect(() => {
    setQueryInput(normalizedInitialQuery);
    setDebouncedQuery(normalizeSearchText(normalizedInitialQuery));
  }, [normalizedInitialQuery]);

  useEffect(() => {
    const currentQuery = normalizeSearchParamsString(searchParams);
    if (currentQuery === lastInternalSearchQueryRef.current) {
      return;
    }

    // URL-driven filter changes should hydrate local state before we write back to the URL.
    isHydratingFromUrlRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedQuery(normalizeSearchText(queryInput.trim()));
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceTimer);
    };
  }, [queryInput]);

  const departmentScopedProducts = useMemo(() => {
    if (department === "all") {
      return products;
    }
    return products.filter((product) => product.department === department);
  }, [department]);

  const purchasableDepartmentProducts = useMemo(
    () =>
      departmentScopedProducts.filter(
        (product) => product.availability === "available" || isInquiryOnlyProduct(product),
      ),
    [departmentScopedProducts],
  );

  const categoryOptions = useMemo(() => {
    const seededLabels =
      department === "all"
        ? ALL_DEFAULT_CATEGORIES
        : department === "men"
        ? MEN_DEFAULT_CATEGORIES
        : department === "jewelry"
          ? JEWELRY_DEFAULT_CATEGORIES
          : WOMEN_DEFAULT_CATEGORIES;

    const optionMap = new Map<string, FacetOption>();
    for (const seededLabel of seededLabels) {
      const option = toFacetOption(seededLabel);
      optionMap.set(option.value, option);
    }

    for (const product of departmentScopedProducts) {
      const option = toFacetOption(product.category);
      if (!optionMap.has(option.value)) {
        optionMap.set(option.value, option);
      }
    }

    return Array.from(optionMap.values())
      .filter((option) => !HIDDEN_CATEGORY_KEYS.has(option.value))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [department, departmentScopedProducts]);

  useEffect(() => {
    // Keep initial category from URL on first render.
    if (!didMountDepartmentResetEffectRef.current) {
      didMountDepartmentResetEffectRef.current = true;
      return;
    }

    setCategory("all");
  }, [department]);

  useEffect(() => {
    if (category === "all") {
      return;
    }

    if (!categoryOptions.some((option) => option.value === category)) {
      setCategory("all");
    }
  }, [category, categoryOptions]);

  const sizeOptions = useMemo(() => {
    const optionMap = new Map<string, string>();

    for (const product of purchasableDepartmentProducts) {
      if (category !== "all" && categoryKey(product.category) !== category) {
        continue;
      }

      for (const productSize of product.sizes) {
        const normalizedSize = normalizeToStandardSizeKey(productSize);
        if (!normalizedSize || optionMap.has(normalizedSize)) {
          continue;
        }
        optionMap.set(normalizedSize, standardSizeLabel(normalizedSize));
      }
    }

    return STANDARD_SIZE_KEYS.filter((sizeOptionKey) => optionMap.has(sizeOptionKey)).map((sizeOptionKey) => ({
      value: sizeOptionKey,
      label: standardSizeLabel(sizeOptionKey),
    }));
  }, [category, purchasableDepartmentProducts]);

  useEffect(() => {
    // Keep initial size from URL on first render.
    if (!didMountSizeResetEffectRef.current) {
      didMountSizeResetEffectRef.current = true;
      return;
    }

    setSize("all");
  }, [department, category]);

  useEffect(() => {
    if (size === "all") {
      return;
    }

    if (!sizeOptions.some((option) => option.value === size)) {
      setSize("all");
    }
  }, [size, sizeOptions]);

  const filteredProducts = useMemo(() => {
    const filtered = products
      .map((product) => ({
        product,
        searchScore: debouncedQuery ? scoreProductSearchMatch(debouncedQuery, product) : 0,
      }))
      .filter(({ product, searchScore }) => {
        const inDepartment = department === "all" || product.department === department;
        const inCategory = category === "all" || categoryKey(product.category) === category;
        const inAvailability = availability === "all" || product.availability === availability;
        const isOnSale = Boolean(product.salePercent && product.compareAtPrice);
        const inSaleFilter =
          saleFilter === "all" ||
          (saleFilter === "on-sale" && isOnSale) ||
          (saleFilter === "regular-price" && !isOnSale);
        const inSize = size === "all" || product.sizes.some((productSize) => sizeKey(productSize) === size);
        const inPriceRange = hasDisplayPrice(product)
          ? (resolvedMinPriceCad === null || product.price >= resolvedMinPriceCad) &&
            (resolvedMaxPriceCad === null || product.price <= resolvedMaxPriceCad)
          : resolvedMinPriceCad === null && resolvedMaxPriceCad === null;
        const matchesQuery = !debouncedQuery || searchScore > 0;

        return (
          inDepartment && inCategory && inAvailability && inSaleFilter && inSize && inPriceRange && matchesQuery
        );
      });

    return filtered
      .sort((a, b) => {
        if (debouncedQuery && b.searchScore !== a.searchScore) {
          return b.searchScore - a.searchScore;
        }

        if (sortBy === "alphabetical") {
          return a.product.name.localeCompare(b.product.name, undefined, { sensitivity: "base" });
        }
        if (sortBy === "price-low") {
          const aPrice = hasDisplayPrice(a.product) ? a.product.price : Number.POSITIVE_INFINITY;
          const bPrice = hasDisplayPrice(b.product) ? b.product.price : Number.POSITIVE_INFINITY;
          return aPrice - bPrice;
        }
        if (sortBy === "price-high") {
          const aPrice = hasDisplayPrice(a.product) ? a.product.price : Number.NEGATIVE_INFINITY;
          const bPrice = hasDisplayPrice(b.product) ? b.product.price : Number.NEGATIVE_INFINITY;
          return bPrice - aPrice;
        }
        if (sortBy === "popular") {
          return b.product.popularity - a.product.popularity;
        }

        return new Date(b.product.createdAt).getTime() - new Date(a.product.createdAt).getTime();
      })
      .map((entry) => entry.product);
  }, [
    availability,
    category,
    debouncedQuery,
    department,
    resolvedMaxPriceCad,
    resolvedMinPriceCad,
    saleFilter,
    size,
    sortBy,
  ]);

  useEffect(() => {
    setVisibleProductCount(PRODUCTS_PER_PAGE);
  }, [
    availability,
    category,
    debouncedQuery,
    department,
    resolvedMaxPriceCad,
    resolvedMinPriceCad,
    saleFilter,
    size,
    sortBy,
  ]);

  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  const hasMoreProducts = visibleProducts.length < filteredProducts.length;
  const restoreCollectionScroll = Boolean(
    (location.state as { restoreCollectionScroll?: boolean } | null)?.restoreCollectionScroll,
  );

  useEffect(() => {
    if (!restoreCollectionScroll && navigationType !== "POP") {
      return;
    }

    const savedScrollY = consumePendingCollectionScrollPosition({
      pathname: location.pathname,
      search: location.search,
    });
    if (savedScrollY === null) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedScrollY, left: 0, behavior: "auto" });
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [location.pathname, location.search, navigationType, restoreCollectionScroll]);

  useEffect(() => {
    const nextPath = buildCollectionPath(department);
    const currentPath = normalizeCollectionPath(location.pathname);
    if (!isDepartmentUserDrivenRef.current && currentPath !== nextPath) {
      return;
    }

    if (currentPath === nextPath) {
      isDepartmentUserDrivenRef.current = false;
      return;
    }

    navigate({ pathname: nextPath, search: location.search }, { replace: true });
  }, [department, location.pathname, location.search, navigate]);

  useEffect(() => {
    const nextParams = new URLSearchParams();

    if (queryInput.trim()) {
      nextParams.set("search", queryInput.trim());
    }
    if (category !== "all") {
      nextParams.set("category", category);
    }
    if (availability !== "all") {
      nextParams.set("availability", availability);
    }
    if (saleFilter !== "all") {
      nextParams.set("sale", saleFilter);
    }
    if (size !== "all") {
      nextParams.set("size", size);
    }
    if (minPriceInput.trim()) {
      nextParams.set("min", minPriceInput.trim());
    }
    if (maxPriceInput.trim()) {
      nextParams.set("max", maxPriceInput.trim());
    }
    if (sortBy !== "newest") {
      nextParams.set("sort", sortBy);
    }
    const currentQuery = normalizeSearchParamsString(searchParams);
    const nextQuery = nextParams.toString();
    if (isHydratingFromUrlRef.current) {
      if (currentQuery === nextQuery) {
        isHydratingFromUrlRef.current = false;
        lastInternalSearchQueryRef.current = currentQuery;
      }
      return;
    }

    if (currentQuery !== nextQuery) {
      lastInternalSearchQueryRef.current = nextQuery;
      setSearchParams(nextParams, { replace: true });
      return;
    }

    lastInternalSearchQueryRef.current = currentQuery;
  }, [
    availability,
    category,
    maxPriceInput,
    minPriceInput,
    queryInput,
    saleFilter,
    searchParams,
    setSearchParams,
    size,
    sortBy,
  ]);

  const collectionHeading = getCollectionHeading(department);
  const priceFilterLabel = currency === "USD" ? "USD (est.)" : "CAD";

  const resetFilters = () => {
    setQueryInput("");
    setDebouncedQuery("");
    setDepartmentFromUser("all");
    setCategory("all");
    setAvailability("all");
    setSaleFilter("all");
    setSize("all");
    setMinPriceInput("");
    setMaxPriceInput("");
    setSortBy("newest");
    setVisibleProductCount(PRODUCTS_PER_PAGE);
  };

  return (
    <section id="collection" className="bg-background py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-10 text-center sm:mb-14">
          <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Handcrafted with Love</p>
          <h1 className="text-3xl font-display font-bold text-foreground sm:text-4xl md:text-5xl">
            {collectionHeading.title}
          </h1>
          <p className="mt-2 font-body text-sm text-muted-foreground sm:text-base">{collectionHeading.subtitle}</p>
        </div>

        <div className="mb-10 border-y border-border/70 py-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <p className="font-body text-lg font-semibold tracking-[0.02em] text-foreground">Filter</p>
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">

              <div className="w-full sm:col-span-2 md:col-span-2">
                <div className="relative h-10">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <Input
                    id="collection-search"
                    aria-label="Search products"
                    value={queryInput}
                    onChange={(event) => setQueryInput(event.target.value)}
                    placeholder="Name, color, category..."
                    className="h-full rounded-full border-border/80 bg-background/80 pl-10 text-sm shadow-sm"
                  />
                </div>
              </div>

              <div className="w-full">
                <Select value={department} onValueChange={(value) => setDepartmentFromUser(value as DepartmentOption)}>
                  <SelectTrigger className="h-10 rounded-full border-border/80 bg-background/80 px-4 text-sm shadow-sm">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((departmentItem) => (
                      <SelectItem key={departmentItem} value={departmentItem}>
                        {departmentItem === "all" ? "All departments" : DEPARTMENT_LABELS[departmentItem]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10 rounded-full border-border/80 bg-background/80 px-4 text-sm shadow-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryOptions.map((categoryOption) => (
                      <SelectItem key={categoryOption.value} value={categoryOption.value}>
                        {categoryOption.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full">
                <Select value={availability} onValueChange={(value) => setAvailability(value as AvailabilityOption)}>
                  <SelectTrigger className="h-10 rounded-full border-border/80 bg-background/80 px-4 text-sm shadow-sm">
                    <SelectValue placeholder="Availability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All availability</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="sold_out">Sold Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full">
                <Select value={saleFilter} onValueChange={(value) => setSaleFilter(value as SaleOption)}>
                  <SelectTrigger className="h-10 rounded-full border-border/80 bg-background/80 px-4 text-sm shadow-sm">
                    <SelectValue placeholder="On Sale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    <SelectItem value="on-sale">On sale</SelectItem>
                    <SelectItem value="regular-price">Regular price</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full">
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger className="h-10 rounded-full border-border/80 bg-background/80 px-4 text-sm shadow-sm">
                    <SelectValue placeholder="Size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sizes</SelectItem>
                    {sizeOptions.map((sizeOption) => (
                      <SelectItem key={sizeOption.value} value={sizeOption.value}>
                        {sizeOption.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid w-full grid-cols-2 gap-2 sm:col-span-2 md:col-span-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  aria-label={`Minimum price in ${priceFilterLabel}`}
                  placeholder={`Min ${priceFilterLabel}`}
                  value={minPriceInput}
                  onChange={(event) => setMinPriceInput(event.target.value)}
                  className="h-10 rounded-full border-border/80 bg-background/80 px-4 text-sm shadow-sm"
                />

                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  aria-label={`Maximum price in ${priceFilterLabel}`}
                  placeholder={`Max ${priceFilterLabel}`}
                  value={maxPriceInput}
                  onChange={(event) => setMaxPriceInput(event.target.value)}
                  className="h-10 rounded-full border-border/80 bg-background/80 px-4 text-sm shadow-sm"
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={resetFilters}
                className="h-10 w-full rounded-full px-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Reset
              </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground">Sort by</p>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                  <SelectTrigger className="h-10 w-[178px] rounded-full border-border/80 bg-background/80 px-4 text-sm shadow-sm">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="alphabetical">Alphabetical</SelectItem>
                    <SelectItem value="popular">Popular</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="rounded-md border border-border bg-card/30 p-8 text-center">
            <p className="font-display text-2xl text-foreground">No results found</p>
            <p className="mt-2 font-body text-muted-foreground">Try adjusting your search or filter settings.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
              {visibleProducts.map((product) => (
                <div key={product.id} className="h-full min-w-0">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>

            {hasMoreProducts ? (
              <div className="mt-10 flex flex-col items-center justify-center gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Showing {visibleProducts.length} of {filteredProducts.length}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-w-[180px] text-base"
                  onClick={() => setVisibleProductCount((count) => count + PRODUCTS_PER_PAGE)}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

export default ProductGrid;
