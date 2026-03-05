import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { type Product, products } from "@/features/catalog/data/products";
import { useCart } from "@/features/cart/context/CartContext";
import { formatCad } from "@/lib/money";
import { normalizeSearchText, normalizedTextMatchesQuery, scoreWeightedSearchDocument } from "@/lib/search";
import BagIcon from "@/shared/ui/BagIcon";
import { Input } from "@/shared/ui/input";

interface NavbarProps {
  onCartClick: () => void;
}

const POPULAR_SEARCH_TERMS = [
  "Women's",
  "Men's",
  "Bridal",
  "Party wear",
  "Handmade",
  "Formal",
] as const;

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
      keywords: [product.fabric, product.colors.join(" ")].join(" "),
    },
    normalizedQuery,
  );

const desktopNavLinkClass = (isActive: boolean) =>
  `transition-colors hover:text-foreground hover:underline underline-offset-4 ${
    isActive ? "text-foreground underline" : "text-muted-foreground"
  }`;

const mobileNavLinkClass = (isActive: boolean) =>
  `rounded-sm px-2 py-2 font-body text-base transition-colors hover:bg-secondary hover:text-foreground ${
    isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
  }`;

const Navbar = ({ onCartClick }: NavbarProps) => {
  const { totalItems } = useCart();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSearchQuery = normalizeSearchText(searchQuery.trim());

  const availableProducts = useMemo(
    () =>
      products
        .filter((product) => product.availability === "available")
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
    trendingProducts.slice(0, 6).forEach((product) => {
      const image = new Image();
      image.src = product.image;
    });
  }, [trendingProducts]);

  const suggestionTerms = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [...POPULAR_SEARCH_TERMS];
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

    const popularMatches = POPULAR_SEARCH_TERMS.filter((term) =>
      normalizedTextMatchesQuery(normalizeSearchText(term), normalizedSearchQuery),
    );

    return Array.from(
      new Set([...departmentMatches, ...productNameMatches, ...categoryMatches, ...popularMatches]),
    ).slice(0, 8);
  }, [availableProducts, normalizedSearchQuery]);

  const activeDepartment = useMemo<"women" | "men" | null>(() => {
    const queryDepartment = new URLSearchParams(search).get("department")?.trim().toLowerCase();
    if (queryDepartment === "women" || queryDepartment === "men") {
      return queryDepartment;
    }

    if (pathname.startsWith("/collection/")) {
      const routeDepartment = pathname.split("/")[2]?.trim().toLowerCase();
      if (routeDepartment === "women" || routeDepartment === "men") {
        return routeDepartment;
      }
    }

    return null;
  }, [pathname, search]);

  const isCollectionRoute = pathname.startsWith("/collection");
  const isWomensActive = isCollectionRoute && activeDepartment === "women";
  const isMensActive = isCollectionRoute && activeDepartment === "men";
  const isAboutActive = pathname === "/about";
  const isFaqActive = pathname === "/faq";

  useEffect(() => {
    setMobileMenuOpen(false);
    setSearchOpen(false);
  }, [pathname, search]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSearchPanel();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [searchOpen]);

  const handleHomeClick = () => {
    if (pathname === "/") {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const openSearchPanel = () => {
    setMobileMenuOpen(false);
    setSearchOpen(true);
  };

  const closeSearchPanel = () => {
    setSearchOpen(false);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = searchQuery.trim();
    const target = normalizedQuery
      ? `/collection?search=${encodeURIComponent(normalizedQuery)}`
      : "/collection";

    navigate(target);
    closeSearchPanel();
  };

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
        <Link
          to="/"
          onClick={handleHomeClick}
          className="flex items-center gap-2 rounded-sm text-xl font-display font-bold tracking-wide text-foreground transition-colors hover:text-gold sm:text-2xl md:justify-self-start"
          aria-label="Go to homepage"
        >
          <span>
            Ria&apos;s <span className="text-gold">Boutique</span>
          </span>
        </Link>

        <div className="justify-self-center hidden items-center gap-8 font-body text-lg md:flex">
          <Link
            to="/collection/women"
            className={desktopNavLinkClass(isWomensActive)}
          >
            Women's
          </Link>
          <Link
            to="/collection/men"
            className={desktopNavLinkClass(isMensActive)}
          >
            Men's
          </Link>
          <Link to="/about" className={desktopNavLinkClass(isAboutActive)}>
            About
          </Link>
          <Link to="/faq" className={desktopNavLinkClass(isFaqActive)}>
            FAQ
          </Link>
        </div>

        <div className="flex items-center gap-1 md:justify-self-end">
          <button
            type="button"
            onClick={openSearchPanel}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background/85 px-3 text-sm font-body text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Open search"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
          </button>

          <button
            onClick={onCartClick}
            className="relative rounded-sm p-2 text-foreground transition-colors hover:text-gold"
            aria-label="Shopping cart"
          >
            <BagIcon className="h-6 w-6" />
            {totalItems > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {totalItems}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setMobileMenuOpen((open) => !open);
            }}
            className="rounded-sm p-2 text-foreground transition-colors hover:text-gold md:hidden"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navbar-menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div id="mobile-navbar-menu" className="border-t border-border bg-background/95 backdrop-blur md:hidden">
          <div className="container mx-auto flex flex-col gap-1 px-4 py-3 sm:px-6">
            <Link
              to="/collection/women"
              onClick={closeMobileMenu}
              className={mobileNavLinkClass(isWomensActive)}
            >
              Women's
            </Link>
            <Link
              to="/collection/men"
              onClick={closeMobileMenu}
              className={mobileNavLinkClass(isMensActive)}
            >
              Men's
            </Link>
            <Link
              to="/about"
              onClick={closeMobileMenu}
              className={mobileNavLinkClass(isAboutActive)}
            >
              About
            </Link>
            <Link to="/faq" onClick={closeMobileMenu} className={mobileNavLinkClass(isFaqActive)}>
              FAQ
            </Link>
          </div>
        </div>
      ) : null}

      <>
        <button
          type="button"
          onClick={closeSearchPanel}
          tabIndex={searchOpen ? 0 : -1}
          aria-hidden={!searchOpen}
          className={`fixed inset-0 z-[55] bg-black/50 transition-opacity duration-100 ${
            searchOpen ? "visible pointer-events-auto opacity-100" : "invisible pointer-events-none opacity-0"
          }`}
          aria-label="Close search overlay"
        />

        <div
          aria-hidden={!searchOpen}
          className={`fixed inset-x-0 top-0 z-[70] max-h-[82dvh] overflow-y-auto border-b border-border/90 bg-background shadow-[0_18px_48px_-30px_rgba(0,0,0,0.45)] transform-gpu will-change-transform transition-[transform,opacity] duration-150 ease-out ${
            searchOpen
              ? "visible pointer-events-auto translate-y-0 opacity-100"
              : "invisible pointer-events-none -translate-y-3 opacity-0"
          }`}
        >
          <div className="w-full px-3 pb-5 pt-4 sm:px-8 sm:pb-6 sm:pt-5 lg:px-12">
                <div className="flex items-center gap-2 sm:gap-3">
                  <form onSubmit={handleSearchSubmit} className="relative flex-1">
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
                    onClick={closeSearchPanel}
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
                          onClick={closeSearchPanel}
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
                              onClick={closeSearchPanel}
                              className="group block rounded-sm border border-border/80 bg-card p-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-boutique"
                            >
                              <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-muted/20">
                                <img
                                  src={product.image}
                                  alt={product.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                  loading={index < 4 ? "eager" : "lazy"}
                                />
                                <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-2 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                                  View product
                                </div>
                              </div>
                              <p className="mt-1 line-clamp-1 text-xs font-semibold text-foreground sm:text-sm">{product.name}</p>
                              <p className="line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">{product.category}</p>
                              <p className="mt-0.5 text-xs font-medium text-foreground sm:text-sm">{formatCad(product.price)}</p>
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
                          onClick={closeSearchPanel}
                          className="group block rounded-sm border border-border/80 bg-card p-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-boutique"
                        >
                          <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-muted/20">
                            <img
                              src={product.image}
                              alt={product.name}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                              loading={index < 4 ? "eager" : "lazy"}
                            />
                            <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 translate-y-2 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                              View product
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs font-semibold text-foreground sm:text-sm">{product.name}</p>
                          <p className="line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">{product.category}</p>
                          <p className="mt-0.5 text-xs font-medium text-foreground sm:text-sm">{formatCad(product.price)}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
          </div>
        </div>
      </>
    </nav>
  );
};

export default Navbar;
