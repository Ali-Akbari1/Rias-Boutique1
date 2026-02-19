import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { products } from "@/features/catalog/data/products";
import ProductCard from "./ProductCard";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

type SortOption = "newest" | "price-low" | "price-high" | "popular";
type PriceOption = "all" | "under-300" | "300-400" | "over-400";
const SEARCH_DEBOUNCE_MS = 250;
const PRODUCTS_PER_PAGE = 9;

const ProductGrid = () => {
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [priceRange, setPriceRange] = useState<PriceOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const categories = useMemo(() => ["all", ...new Set(products.map((product) => product.category))], []);

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedQuery(queryInput.trim().toLowerCase());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceTimer);
    };
  }, [queryInput]);

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const inCategory = category === "all" || product.category === category;
      const inPriceRange =
        priceRange === "all" ||
        (priceRange === "under-300" && product.price < 300) ||
        (priceRange === "300-400" && product.price >= 300 && product.price <= 400) ||
        (priceRange === "over-400" && product.price > 400);

      const searchableKeywords = [
        product.name,
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

      return inCategory && inPriceRange && matchesQuery;
    });

    return filtered.sort((a, b) => {
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
  }, [category, debouncedQuery, priceRange, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [category, debouncedQuery, priceRange, sortBy]);

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
    setCategory("all");
    setPriceRange("all");
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

        <div className="mb-8 grid gap-3 rounded-md border border-border bg-card/40 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative self-start sm:col-span-2 lg:col-span-2">
            <label htmlFor="collection-search" className="sr-only">
              Search products
            </label>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Search className="h-4 w-4 text-muted-foreground" />
            </span>
            <Input
              id="collection-search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Search by name, color, category..."
              className="h-10 pl-10"
            />
          </div>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((categoryItem) => (
                <SelectItem key={categoryItem} value={categoryItem}>
                  {categoryItem === "all" ? "All categories" : categoryItem}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priceRange} onValueChange={(value) => setPriceRange(value as PriceOption)}>
            <SelectTrigger>
              <SelectValue placeholder="Price" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All prices</SelectItem>
              <SelectItem value="under-300">Under CA$300</SelectItem>
              <SelectItem value="300-400">CA$300 - CA$400</SelectItem>
              <SelectItem value="over-400">Over CA$400</SelectItem>
            </SelectContent>
          </Select>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="popular">Popular</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={resetFilters}>
              Reset
            </Button>
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


