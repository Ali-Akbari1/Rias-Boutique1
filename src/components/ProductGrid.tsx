import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { products } from "@/data/products";
import ProductCard from "./ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SortOption = "newest" | "price-low" | "price-high" | "popular";
type PriceOption = "all" | "under-300" | "300-400" | "over-400";

const ProductGrid = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [priceRange, setPriceRange] = useState<PriceOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const categories = useMemo(() => ["all", ...new Set(products.map((product) => product.category))], []);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = products.filter((product) => {
      const inCategory = category === "all" || product.category === category;
      const inPriceRange =
        priceRange === "all" ||
        (priceRange === "under-300" && product.price < 300) ||
        (priceRange === "300-400" && product.price >= 300 && product.price <= 400) ||
        (priceRange === "over-400" && product.price > 400);

      const matchesQuery =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery) ||
        product.colors.join(" ").toLowerCase().includes(normalizedQuery);

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
  }, [category, priceRange, query, sortBy]);

  const resetFilters = () => {
    setQuery("");
    setCategory("all");
    setPriceRange("all");
    setSortBy("newest");
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
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Search className="h-4 w-4 text-muted-foreground" />
            </span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
              <SelectItem value="under-300">Under $300</SelectItem>
              <SelectItem value="300-400">$300 - $400</SelectItem>
              <SelectItem value="over-400">Over $400</SelectItem>
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
          Showing {filteredProducts.length} of {products.length} products
        </p>

        {filteredProducts.length === 0 ? (
          <div className="rounded-md border border-border bg-card/30 p-8 text-center">
            <p className="font-display text-2xl text-foreground">No results found</p>
            <p className="mt-2 font-body text-muted-foreground">Try adjusting your search or filter settings.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
            {filteredProducts.map((product, index) => (
              <div key={product.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.08}s` }}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductGrid;
