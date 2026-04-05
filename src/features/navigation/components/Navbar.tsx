import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, Search, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "@/features/cart/context/CartContext";
import { useCurrency } from "@/features/currency/context/useCurrency";
import DesktopNav from "@/features/navigation/components/navbar/DesktopNav";
import MobileNav from "@/features/navigation/components/navbar/MobileNav";
import SearchOverlay from "@/features/navigation/components/navbar/SearchOverlay";
import { useNavbarSearch } from "@/features/navigation/hooks/useNavbarSearch";
import BagIcon from "@/shared/ui/BagIcon";

interface NavbarProps {
  onCartClick: () => void;
}

const Navbar = ({ onCartClick }: NavbarProps) => {
  const { totalItems, isAdding } = useCart();
  const { currency, setCurrency } = useCurrency();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const lastScrollY = useRef(0);
  const isTicking = useRef(false);
  const currencyRef = useRef<HTMLDivElement | null>(null);
  const {
    searchInputRef,
    searchQuery,
    setSearchQuery,
    normalizedSearchQuery,
    matchingProducts,
    trendingProducts,
    suggestionTerms,
    isWomensActive,
    isMensActive,
    isAboutActive,
    isFaqActive,
  } = useNavbarSearch({ pathname, search });

  useEffect(() => {
    setMobileMenuOpen(false);
    setSearchOpen(false);
    setCurrencyOpen(false);
  }, [pathname, search]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setShowPromo(true);
      return;
    }

    const shouldShow = window.scrollY <= 8;
    const timer = window.setTimeout(() => {
      setShowPromo(shouldShow);
    }, 60);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

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
  }, [searchInputRef, searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [searchOpen]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScroll = window.scrollY || 0;
      if (isTicking.current) {
        return;
      }

      isTicking.current = true;
      window.requestAnimationFrame(() => {
        const lastScroll = lastScrollY.current;

        if (currentScroll <= 8) {
          setShowPromo(true);
        } else if (currentScroll > lastScroll) {
          setShowPromo(false);
        } else if (currentScroll + 8 < lastScroll) {
          setShowPromo(true);
        }

        lastScrollY.current = currentScroll;
        isTicking.current = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!currencyOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!currencyRef.current?.contains(event.target as Node)) {
        setCurrencyOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCurrencyOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [currencyOpen]);

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
      <div
        className={`overflow-hidden bg-foreground text-background transition-[max-height,opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          showPromo ? "max-h-14 translate-y-0 opacity-100" : "max-h-0 -translate-y-2 opacity-0"
        }`}
        aria-hidden={!showPromo}
      >
        <div className="container mx-auto flex flex-col items-center justify-center gap-1 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] sm:flex-row sm:gap-2 sm:text-[11px] sm:tracking-[0.2em]">
          <span>Free shipping on orders over $400 CAD | Worldwide shipping</span>
        </div>
      </div>
      <div className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
        <Link
          to="/"
          onClick={handleHomeClick}
          className="flex max-w-[210px] items-center gap-2 whitespace-nowrap rounded-sm text-[10px] font-brand uppercase leading-none tracking-[0.12em] text-foreground transition-colors hover:text-gold sm:max-w-none sm:text-base sm:tracking-[0.2em] md:justify-self-start lg:text-lg"
          aria-label="Go to homepage"
        >
          <span>R I A &apos; S&nbsp;&nbsp;B O U T I Q U E</span>
        </Link>

        <DesktopNav
          isWomensActive={isWomensActive}
          isMensActive={isMensActive}
          isAboutActive={isAboutActive}
          isFaqActive={isFaqActive}
        />

        <div className="flex items-center gap-1.5 sm:gap-2 md:justify-self-end">
          <div className="relative" ref={currencyRef}>
            <span className="sr-only" id="currency-switcher-label">
              Currency
            </span>
            <button
              type="button"
              onClick={() => setCurrencyOpen((open) => !open)}
              className="relative flex h-9 w-[96px] items-center justify-center rounded-full border border-border bg-background/85 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 sm:w-[120px] sm:text-[11px] sm:tracking-[0.14em]"
              aria-label="Select currency"
              aria-haspopup="listbox"
              aria-expanded={currencyOpen}
              aria-labelledby="currency-switcher-label"
            >
              <span>{currency === "USD" ? "USD est." : "CAD"}</span>
              <ChevronDown
                className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-transform ${
                  currencyOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {currencyOpen ? (
              <div
                role="listbox"
                aria-label="Currency"
                className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-border bg-background shadow-boutique animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={currency === "CAD"}
                  onClick={() => {
                    setCurrency("CAD");
                    setCurrencyOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors sm:text-[11px] sm:tracking-[0.14em] ${
                    currency === "CAD"
                      ? "bg-foreground text-background"
                      : "text-foreground hover:bg-secondary"
                  }`}
                >
                  CAD
                </button>
                <button
                  type="button"
                  role="option"
                  aria-selected={currency === "USD"}
                  onClick={() => {
                    setCurrency("USD");
                    setCurrencyOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors sm:text-[11px] sm:tracking-[0.14em] ${
                    currency === "USD"
                      ? "bg-foreground text-background"
                      : "text-foreground hover:bg-secondary"
                  }`}
                >
                  USD est.
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={openSearchPanel}
            className="group inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background/85 px-2 text-sm font-body text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-3"
            aria-label="Open search"
          >
            <Search className="h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-y-0.5" />
            <span className="hidden sm:inline">Search</span>
          </button>

          <button
            onClick={onCartClick}
            className="group relative rounded-sm p-1.5 text-foreground transition-colors hover:text-gold sm:p-2"
            aria-label="Shopping cart"
          >
            <BagIcon
              className={`h-6 w-6 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 ${
                isAdding ? "motion-safe:animate-cart-shake" : ""
              }`}
            />
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
            className="group rounded-sm p-1.5 text-foreground transition-colors hover:text-gold md:hidden sm:p-2"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navbar-menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 transition-transform duration-200 ease-out group-hover:-translate-y-0.5" />
            ) : (
              <Menu className="h-6 w-6 transition-transform duration-200 ease-out group-hover:-translate-y-0.5" />
            )}
          </button>
        </div>
      </div>

      <MobileNav
        open={mobileMenuOpen}
        onClose={closeMobileMenu}
        isWomensActive={isWomensActive}
        isMensActive={isMensActive}
        isAboutActive={isAboutActive}
        isFaqActive={isFaqActive}
      />

      <SearchOverlay
        open={searchOpen}
        onClose={closeSearchPanel}
        onSubmit={handleSearchSubmit}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        normalizedSearchQuery={normalizedSearchQuery}
        suggestionTerms={suggestionTerms}
        matchingProducts={matchingProducts}
        trendingProducts={trendingProducts}
      />
    </nav>
  );
};

export default Navbar;
