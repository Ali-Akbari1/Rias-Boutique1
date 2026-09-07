import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { prefetchCollectionPage } from "@/lib/prefetch";
import { getMobileNavLinks, type PrimaryNavState } from "./nav-links";

interface MobileNavProps extends PrimaryNavState {
  open: boolean;
  onClose: () => void;
}

const mobileNavLinkClass = (isActive: boolean) =>
  `group flex items-center justify-between gap-4 border-b border-border/60 py-4 font-body transition-colors last:border-b-0 ${
    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  }`;

const MobileNav = ({ open, onClose, ...state }: MobileNavProps) => {
  if (!open) {
    return null;
  }

  const links = getMobileNavLinks(state);

  return (
    <div
      id="mobile-navbar-menu"
      className="border-t border-border bg-background/95 backdrop-blur md:hidden animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none"
    >
      <div className="container mx-auto px-4 py-3 sm:px-6">
        <p className="pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Shop the collection
        </p>
        <div className="flex flex-col gap-0">
          {links.map((link) => {
          const handlePrefetch = () => {
            if (link.to.startsWith("/collection")) {
              void prefetchCollectionPage();
            }
          };

          return (
            <Link
              key={link.to}
              to={link.to}
              onClick={onClose}
              onMouseEnter={handlePrefetch}
              onFocus={handlePrefetch}
              onTouchStart={handlePrefetch}
              className={mobileNavLinkClass(link.isActive)}
              aria-current={link.isActive ? "page" : undefined}
            >
              <span className="text-lg font-semibold tracking-[0.03em]">{link.label}</span>
              <span className="flex items-center gap-2">
                <span
                  className={`h-px w-7 bg-foreground transition-opacity duration-200 ${
                    link.isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                  }`}
                  aria-hidden="true"
                />
                <ChevronRight
                  className={`h-4 w-4 transition-all duration-200 ${
                    link.isActive
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground"
                  }`}
                />
              </span>
            </Link>
          );
          })}
        </div>
      </div>
    </div>
  );
};

export default MobileNav;
