import { FormEvent, useEffect, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCartState } from "@/features/cart/context/CartContext";
import DesktopNav from "@/features/navigation/components/navbar/DesktopNav";
import MobileNav from "@/features/navigation/components/navbar/MobileNav";
import SearchOverlay from "@/features/navigation/components/navbar/SearchOverlay";
import { useNavbarSearch } from "@/features/navigation/hooks/useNavbarSearch";
import BagIcon from "@/shared/ui/BagIcon";

interface NavbarProps {
  onCartClick: () => void;
}

const Navbar = ({ onCartClick }: NavbarProps) => {
  const { totalItems, isAdding } = useCartState();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const lastScrollY = useRef(0);
  const isTicking = useRef(false);
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
    isBridalActive,
    isJewelryActive,
    isAboutActive,
    isFaqActive,
  } = useNavbarSearch({ pathname, search });

  useEffect(() => {
    setMobileMenuOpen(false);
    setSearchOpen(false);
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
          showPromo ? "max-h-10 translate-y-0 opacity-100" : "max-h-0 -translate-y-2 opacity-0"
        }`}
        aria-hidden={!showPromo}
      >
        <div className="container mx-auto flex h-9 items-center justify-center gap-2 px-4 text-center text-[9px] font-semibold uppercase tracking-[0.16em] sm:text-[10px] sm:tracking-[0.18em]">
          <span>Free shipping on orders over $400 CAD in Canada</span>
          <span className="hidden md:inline" aria-hidden="true">
            |
          </span>
          <span className="hidden md:inline">Worldwide shipping available</span>
        </div>
      </div>
      <div className="container relative mx-auto grid grid-cols-[auto_1fr_auto] items-center px-4 py-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
        <button
          type="button"
          onClick={() => {
            setSearchOpen(false);
            setMobileMenuOpen((open) => !open);
          }}
          className="group col-start-1 rounded-sm p-1.5 text-foreground transition-colors hover:text-gold md:hidden sm:p-2"
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
        <Link
          to="/"
          onClick={handleHomeClick}
          className="absolute left-1/2 z-10 flex -translate-x-1/2 items-center whitespace-nowrap rounded-sm text-[10px] font-brand uppercase leading-none tracking-[0.12em] text-foreground transition-colors hover:text-gold sm:text-base sm:tracking-[0.2em] lg:text-lg"
          aria-label="Go to homepage"
        >
          <span>R I A &apos; S&nbsp;&nbsp;B O U T I Q U E</span>
        </Link>

        <DesktopNav
          isWomensActive={isWomensActive}
          isMensActive={isMensActive}
          isBridalActive={isBridalActive}
          isJewelryActive={isJewelryActive}
          isAboutActive={isAboutActive}
          isFaqActive={isFaqActive}
        />

        <div className="col-start-3 flex items-center gap-1 sm:gap-2 md:row-start-1 md:justify-self-end">
          <button
            type="button"
            onClick={openSearchPanel}
            className="group inline-flex h-9 w-9 items-center justify-center rounded-sm text-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
            aria-label="Open search"
          >
            <Search className="h-5 w-5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5" />
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

        </div>
      </div>

      <MobileNav
        open={mobileMenuOpen}
        onClose={closeMobileMenu}
        isWomensActive={isWomensActive}
        isMensActive={isMensActive}
        isBridalActive={isBridalActive}
        isJewelryActive={isJewelryActive}
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
