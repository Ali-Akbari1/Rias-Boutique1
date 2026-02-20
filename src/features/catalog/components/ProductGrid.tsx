import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { type ProductDepartment, PRODUCT_DEPARTMENTS, products } from "@/features/catalog/data/products";
import ProductCard from "./ProductCard";
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
const sizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

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

const normalizeSizeToken = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const getSizeRank = (value: string) => {
  const normalized = value.trim().toLowerCase();
  const firstToken = normalizeSizeToken(normalized.split(/[\s(/-]+/)[0] || "");

  const exactRankMap: Record<string, number> = {
    xxs: 0,
    xs: 1,
    xsmall: 1,
    s: 2,
    sm: 2,
    small: 2,
    m: 3,
    md: 3,
    medium: 3,
    l: 4,
    lg: 4,
    large: 4,
    xl: 5,
    xlarge: 5,
    xxl: 6,
    xxlrg: 6,
    xxxl: 7,
  };

  if (exactRankMap[firstToken] !== undefined) {
    return exactRankMap[firstToken];
  }

  if (/\bxxs\b|extra\s*small/.test(normalized)) {
    return 1;
  }
  if (/\bsm\b|\bsmall\b|\bs\b/.test(normalized)) {
    return 2;
  }
  if (/\bmd\b|\bmedium\b|\bm\b/.test(normalized)) {
    return 3;
  }
  if (/\blg\b|\blarge\b|\bl\b/.test(normalized)) {
    return 4;
  }
  if (/\bxl\b|extra\s*large/.test(normalized)) {
    return 5;
  }
  if (/\bxxl\b/.test(normalized)) {
    return 6;
  }
  if (/\bxxxl\b/.test(normalized)) {
    return 7;
  }

  return 99;
};

const ProductGrid = ({ initialDepartment = "all" }: ProductGridProps) => {
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [department, setDepartment] = useState<DepartmentOption>(initialDepartment);
  const [category, setCategory] = useState("all");
  const [availability, setAvailability] = useState<AvailabilityOption>("all");
  const [saleFilter, setSaleFilter] = useState<SaleOption>("all");
  const [size, setSize] = useState("all");
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [currentPage, setCurrentPage] = useState(1);

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

  useEffect(() => {
    setDepartment(initialDepartment);
  }, [initialDepartment]);

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedQuery(queryInput.trim().toLowerCase());
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

    for (const product of departmentScopedProducts) {
      if (category !== "all" && categoryKey(product.category) !== category) {
        continue;
      }

      for (const productSize of product.sizes) {
        const normalizedSize = sizeKey(productSize);
        if (!normalizedSize || optionMap.has(normalizedSize)) {
          continue;
        }
        optionMap.set(normalizedSize, productSize);
      }
    }

    return Array.from(optionMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => {
        const rankDiff = getSizeRank(a.label) - getSizeRank(b.label);
        if (rankDiff !== 0) {
          return rankDiff;
        }
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
      });
  }, [category, departmentScopedProducts]);

  useEffect(() => {
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
    const filtered = products.filter((product) => {
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
        (resolvedMinPrice === null || product.price >= resolvedMinPrice) &&
        (resolvedMaxPrice === null || product.price <= resolvedMaxPrice);

      const searchableKeywords = [
        product.name,
        product.department,
        product.category,
        product.description,
        product.fabric,
        product.fitInfo,
        product.colors.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery =
        !debouncedQuery ||
        searchableKeywords.includes(debouncedQuery);

      return inDepartment && inCategory && inAvailability && inSaleFilter && inSize && inPriceRange && matchesQuery;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "alphabetical") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      if (sortBy === "price-low") {
        return a.price - b.price;
      }
      if (sortBy === "price-high") {
        return b.price - a.price;
      }
      if (sortBy === "popular") {
        return b.popularity - a.popularity;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [availability, category, debouncedQuery, department, resolvedMaxPrice, resolvedMinPrice, saleFilter, size, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [availability, category, debouncedQuery, department, resolvedMaxPrice, resolvedMinPrice, saleFilter, size, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (safePage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  }, [filteredProducts, safePage]);

  const rangeStart = filteredProducts.length === 0 ? 0 : (safePage - 1) * PRODUCTS_PER_PAGE + 1;
  const rangeEnd = filteredProducts.length === 0 ? 0 : Math.min(safePage * PRODUCTS_PER_PAGE, filteredProducts.length);

  const resetFilters = () => {
    setQueryInput("");
    setDebouncedQuery("");
    setDepartment(initialDepartment);
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
          <h2 className="text-3xl font-display font-bold text-foreground sm:text-4xl md:text-5xl">Our Collection</h2>
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
              <Select value={department} onValueChange={(value) => setDepartment(value as DepartmentOption)}>
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
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Min Price (CA$)</p>
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
              <p className="text-xs font-body uppercase tracking-[0.08em] leading-none text-muted-foreground">Max Price (CA$)</p>
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
                <div key={product.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.08}s` }}>
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
