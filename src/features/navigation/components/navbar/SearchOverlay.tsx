import type { FormEvent, RefObject } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { hasDisplayPrice, isInquiryOnlyProduct, type Product } from "@/features/catalog/data/products";
import { useCurrency } from "@/features/currency/context/useCurrency";
import { formatProductAlt } from "@/lib/seo";
import { Input } from "@/shared/ui/input";

const POPULAR_SEARCH_TERMS = [
  "Women's",
  "Men's",
  "Bridal",
  "Party wear",
  "Handmade",
  "Formal",
] as const;

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  searchInputRef: RefObject<HTMLInputElement>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  normalizedSearchQuery: string;
  suggestionTerms: string[];
  matchingProducts: Product[];
  trendingProducts: Product[];
}

const SearchOverlay = ({
  open,
  onClose,
  onSubmit,
  searchInputRef,
  searchQuery,
  setSearchQuery,
  normalizedSearchQuery,
  suggestionTerms,
  matchingProducts,
  trendingProducts,
}: SearchOverlayProps) => {
  const { formatPrice } = useCurrency();

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className={`fixed inset-0 z-[55] bg-black/50 transition-opacity duration-100 ${
          open ? "visible pointer-events-auto opacity-100" : "invisible pointer-events-none opacity-0"
        }`}
        aria-label="Close search overlay"
      />

      <div
        aria-hidden={!open}
        className={`fixed inset-x-0 top-0 z-[70] max-h-[82dvh] overflow-y-auto border-b border-border/90 bg-background shadow-[0_18px_48px_-30px_rgba(0,0,0,0.45)] transform-gpu will-change-transform transition-[transform,opacity] duration-150 ease-out ${
          open
            ? "visible pointer-events-auto translate-y-0 opacity-100"
            : "invisible pointer-events-none -translate-y-3 opacity-0"
        }`}
      >
        <div className="w-full px-3 pb-5 pt-4 sm:px-8 sm:pb-6 sm:pt-5 lg:px-12">
          <div className="flex items-center gap-2 sm:gap-3">
            <form onSubmit={onSubmit} className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                aria-label="Search products"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search products"
                className="h-10 rounded-full border-border bg-muted/20 pl-9 pr-10 text-sm sm:h-11 sm:text-base"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </form>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-gold sm:text-base"
            >
              Cancel
            </button>
          </div>

          {!normalizedSearchQuery ? (
            <div className="mt-6">
              <p className="text-sm font-body text-muted-foreground">Popular Search Terms</p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {POPULAR_SEARCH_TERMS.map((term) => (
                  <button
                    key={`popular-search-${term}`}
                    type="button"
                    onClick={() => setSearchQuery(term)}
                    className="inline-flex rounded-full border border-border/70 bg-muted/20 px-3 py-1.5 text-sm text-foreground transition-all duration-150 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-secondary hover:shadow-sm"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-6 lg:grid-cols-[240px_1fr]">
              <div>
                <p className="text-sm font-body text-muted-foreground">Top Suggestions</p>
                <div className="mt-3 space-y-1">
                  {suggestionTerms.length > 0 ? (
                    suggestionTerms.map((term) => (
                      <button
                        key={`suggested-search-${term}`}
                        type="button"
                        onClick={() => setSearchQuery(term)}
                        className="block w-full rounded-sm px-2 py-1.5 text-left text-base text-foreground transition-colors hover:bg-secondary hover:text-foreground/90"
                      >
                        {term}
                      </button>
                    ))
                  ) : (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">No suggestions yet.</p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-body text-muted-foreground">Products</p>
                  <Link
                    to={`/collection?search=${encodeURIComponent(searchQuery.trim())}`}
                    onClick={onClose}
                    className="text-sm font-medium text-foreground transition-colors hover:text-gold hover:underline underline-offset-4"
                  >
                    View all
                  </Link>
                </div>

                {matchingProducts.length === 0 ? (
                  <div className="mt-3 rounded-sm border border-border p-4 text-sm text-muted-foreground">
                    No products found for &quot;{searchQuery.trim()}&quot;.
                  </div>
                ) : (
                  <div
                    className={`mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 ${
                      matchingProducts.length === 1 ? "grid-cols-1" : "grid-cols-2"
                    }`}
                  >
                    {matchingProducts.map((product, index) => (
                      <Link
                        key={`search-result-${product.id}`}
                        to={`/products/${product.id}`}
                        onClick={onClose}
                        className="group block rounded-sm border border-border/80 bg-card p-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-boutique"
                      >
                        <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-muted/20">
                          <img
                            src={product.image}
                            alt={formatProductAlt(product)}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            loading={index < 4 ? "eager" : "lazy"}
                          />
                          <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-2 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                            View product
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs font-semibold text-foreground sm:text-sm">
                          {product.name}
                        </p>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">{product.category}</p>
                        <p className="mt-0.5 text-xs font-medium text-foreground sm:text-sm">
                          {isInquiryOnlyProduct(product)
                            ? "Inquiry Only"
                            : hasDisplayPrice(product)
                              ? formatPrice(product.price)
                              : "View Details"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!normalizedSearchQuery ? (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-sm font-body text-muted-foreground">Trending Picks</p>
              <div
                className={`mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 ${
                  trendingProducts.length <= 5 ? "xl:grid-cols-5 2xl:grid-cols-5" : "xl:grid-cols-6 2xl:grid-cols-6"
                }`}
              >
                {trendingProducts.map((product, index) => (
                  <Link
                    key={`trending-search-${product.id}`}
                    to={`/products/${product.id}`}
                    onClick={onClose}
                    className="group block rounded-sm border border-border/80 bg-card p-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-boutique"
                  >
                    <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-muted/20">
                      <img
                        src={product.image}
                        alt={formatProductAlt(product)}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        loading={index < 4 ? "eager" : "lazy"}
                      />
                      <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-2 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                        View product
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-foreground sm:text-sm">
                      {product.name}
                    </p>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">{product.category}</p>
                    <p className="mt-0.5 text-xs font-medium text-foreground sm:text-sm">
                      {isInquiryOnlyProduct(product)
                        ? "Inquiry Only"
                        : hasDisplayPrice(product)
                          ? formatPrice(product.price)
                          : "View Details"}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};

export default SearchOverlay;
