import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { type ProductDepartment, PRODUCT_DEPARTMENTS, products } from "@/features/catalog/data/products";
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
const PRODUCTS_PER_PAGE = 9;

interface ProductGridProps {
  initialDepartment?: DepartmentOption;
  initialQuery?: string;
}

const DEPARTMENT_LABELS: Record<ProductDepartment, string> = {
  women: "Women",
  men: "Men",
  jewelry: "Jewelry",
};

const WOMEN_DEFAULT_CATEGORIES = ["Party Wear", "Bridal", "Formal"];
const MEN_DEFAULT_CATEGORIES = ["Handmade", "Machine Made"];
const JEWELRY_DEFAULT_CATEGORIES = ["Artificial", "925 Silver"];
const ALL_DEFAULT_CATEGORIES = [
  ...WOMEN_DEFAULT_CATEGORIES,
  ...MEN_DEFAULT_CATEGORIES,
  ...JEWELRY_DEFAULT_CATEGORIES,
];

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

const toPositiveInt = (value: string | null, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const scoreProductSearchMatch = (normalizedQuery: string, product: (typeof products)[number]) =>
  scoreWeightedSearchDocument(
    {
      name: product.name,
      category: product.category,
      department: product.department,
      description: product.description,
      keywords: [product.fabric, product.fitInfo, product.colors.join(" ")].join(" "),
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
  const initialPage = toPositiveInt(searchParams.get("page"), 1);
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
  const [currentPage, setCurrentPage] = useState(initialPage);
  const didMountPageResetEffectRef = useRef(false);
  const didMountPageScrollEffectRef = useRef(false);
  const didMountDepartmentResetEffectRef = useRef(false);
  const didMountSizeResetEffectRef = useRef(false);
  const isDepartmentUserDrivenRef = useRef(false);

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
    setQueryInput(normalizedInitialQuery);
    setDebouncedQuery(normalizeSearchText(normalizedInitialQuery));
  }, [normalizedInitialQuery]);

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
    () => departmentScopedProducts.filter((product) => product.availability === "available"),
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

    return Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
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
        const inPriceRange =
          (resolvedMinPriceCad === null || product.price >= resolvedMinPriceCad) &&
          (resolvedMaxPriceCad === null || product.price <= resolvedMaxPriceCad);
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
          return a.product.price - b.product.price;
        }
        if (sortBy === "price-high") {
          return b.product.price - a.product.price;
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
    // Keep initial page from URL on first render (for return-to-collection behavior).
    if (!didMountPageResetEffectRef.current) {
      didMountPageResetEffectRef.current = true;
      return;
    }

    setCurrentPage(1);
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

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
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
    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  useEffect(() => {
    if (!didMountPageScrollEffectRef.current) {
      didMountPageScrollEffectRef.current = true;
      return;
    }

    const collectionSection = document.getElementById("collection");
    if (collectionSection) {
      collectionSection.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [safePage]);

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
    if (safePage > 1) {
      nextParams.set("page", String(safePage));
    }

    const currentParams = new URLSearchParams(searchParams);
    currentParams.delete("department");
    const currentQuery = currentParams.toString();
    const nextQuery = nextParams.toString();
    if (currentQuery !== nextQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    availability,
    category,
    maxPriceInput,
    minPriceInput,
    queryInput,
    safePage,
    saleFilter,
    searchParams,
    setSearchParams,
    size,
    sortBy,
  ]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (safePage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  }, [filteredProducts, safePage]);

  const rangeStart = filteredProducts.length === 0 ? 0 : (safePage - 1) * PRODUCTS_PER_PAGE + 1;
  const rangeEnd = filteredProducts.length === 0 ? 0 : Math.min(safePage * PRODUCTS_PER_PAGE, filteredProducts.length);
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
    setCurrentPage(1);
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

        <div className="mb-8 rounded-lg border border-border/80 bg-card/60 p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <p className="text-xs font-body uppercase tracking-[0.22em] text-muted-foreground">Filters</p>
            <p className="text-xs font-body text-muted-foreground">Use filters to narrow your collection results</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Search</p>
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
                  className="h-full w-full pl-10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Department</p>
              <Select value={department} onValueChange={(value) => setDepartmentFromUser(value as DepartmentOption)}>
                <SelectTrigger className="h-10 w-full">
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

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Category</p>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 w-full">
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

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Availability</p>
              <Select value={availability} onValueChange={(value) => setAvailability(value as AvailabilityOption)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All availability</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="sold_out">Sold Out</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">On Sale</p>
              <Select value={saleFilter} onValueChange={(value) => setSaleFilter(value as SaleOption)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="On Sale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All products</SelectItem>
                  <SelectItem value="on-sale">On sale</SelectItem>
                  <SelectItem value="regular-price">Regular price</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Size</p>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="h-10 w-full">
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

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">
                Min Price ({priceFilterLabel})
              </p>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                placeholder="Min"
                value={minPriceInput}
                onChange={(event) => setMinPriceInput(event.target.value)}
                className="h-10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">
                Max Price ({priceFilterLabel})
              </p>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                placeholder="Max"
                value={maxPriceInput}
                onChange={(event) => setMaxPriceInput(event.target.value)}
                className="h-10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Sort</p>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger className="h-10 w-full">
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

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Actions</p>
              <Button type="button" variant="outline" onClick={resetFilters} className="h-10 w-full">
                Reset
              </Button>
            </div>
          </div>
        </div>

        <p className="mb-6 text-sm font-body text-muted-foreground">
          Showing {rangeStart}-{rangeEnd} of {filteredProducts.length} products
        </p>

        {filteredProducts.length === 0 ? (
          <div className="rounded-md border border-border bg-card/30 p-8 text-center">
            <p className="font-display text-2xl text-foreground">No results found</p>
            <p className="mt-2 font-body text-muted-foreground">Try adjusting your search or filter settings.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
              {paginatedProducts.map((product, index) => (
                <div
                  key={product.id}
                  className="h-full min-w-0 animate-fade-in"
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  <ProductCard product={product} />
                </div>
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                >
                  Previous
                </Button>

                <span className="px-2 text-sm font-body text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safePage === totalPages}
                  aria-label="Next page"
                >
                  Next
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
