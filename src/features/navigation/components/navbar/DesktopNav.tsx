import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { prefetchCollectionPage } from "@/lib/prefetch";
import { type PrimaryNavState } from "./nav-links";

const desktopNavLinkClass = (isActive: boolean) =>
  `relative inline-flex items-center py-2 text-[1.05rem] font-semibold tracking-[0.04em] transition-colors after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-center after:bg-foreground after:transition-transform after:duration-200 after:ease-out ${
    isActive
      ? "text-foreground after:scale-x-100"
      : "text-foreground after:scale-x-0 hover:after:scale-x-100"
  }`;

const DesktopNav = (state: PrimaryNavState) => {
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const collectionLinks = [
    { to: "/collection/women", label: "Women's", isActive: state.isWomensActive },
    { to: "/collection/men", label: "Men's", isActive: state.isMensActive },
    { to: "/collection/jewelry", label: "Jewelry", isActive: state.isJewelryActive },
  ];

  const handleCollectionPrefetch = () => {
    void prefetchCollectionPage();
  };

  return (
    <div className="hidden items-center justify-self-start font-body md:col-start-1 md:row-start-1 md:ml-8 md:flex lg:ml-14">
      <div
        className="relative"
        onMouseEnter={() => {
          setCollectionsOpen(true);
          handleCollectionPrefetch();
        }}
        onMouseLeave={() => setCollectionsOpen(false)}
      >
        <button
          type="button"
          onClick={() => setCollectionsOpen((open) => !open)}
          onFocus={handleCollectionPrefetch}
          className={`${desktopNavLinkClass(
            state.isWomensActive || state.isMensActive || state.isJewelryActive,
          )} gap-1.5 border-0 bg-transparent`}
          aria-haspopup="menu"
          aria-expanded={collectionsOpen}
        >
          Collections
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${collectionsOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        <div
          className={`absolute left-0 top-[calc(100%+12px)] w-56 border border-border/80 bg-background p-3 shadow-boutique transition-all duration-150 ${
            collectionsOpen
              ? "visible translate-y-0 opacity-100"
              : "invisible -translate-y-1 opacity-0"
          }`}
          role="menu"
          aria-label="Collections"
        >
          <Link
            to="/collection"
            onClick={() => setCollectionsOpen(false)}
            className="block border-b border-border/70 px-3 pb-3 pt-1 text-xs font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:text-gold"
            role="menuitem"
          >
            Shop all
          </Link>
          {collectionLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setCollectionsOpen(false)}
              className={`block px-3 py-3 text-[0.95rem] transition-colors hover:bg-secondary ${
                link.isActive ? "text-foreground" : "text-muted-foreground"
              }`}
              role="menuitem"
              aria-current={link.isActive ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
};

export default DesktopNav;
