import { Link } from "react-router-dom";
import { prefetchAboutPage, prefetchCollectionPage, prefetchFaqPage } from "@/lib/prefetch";
import { getPrimaryNavLinks, type PrimaryNavState } from "./nav-links";

interface MobileNavProps extends PrimaryNavState {
  open: boolean;
  onClose: () => void;
}

const mobileNavLinkClass = (isActive: boolean) =>
  `rounded-sm px-2 py-2 font-body text-base transition-colors hover:bg-secondary hover:text-foreground ${
    isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
  }`;

const MobileNav = ({ open, onClose, ...state }: MobileNavProps) => {
  if (!open) {
    return null;
  }

  const links = getPrimaryNavLinks(state);

  return (
    <div
      id="mobile-navbar-menu"
      className="border-t border-border bg-background/95 backdrop-blur md:hidden animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none"
    >
      <div className="container mx-auto flex flex-col gap-1 px-4 py-3 sm:px-6">
        {links.map((link) => {
          const handlePrefetch = () => {
            if (link.to.startsWith("/collection")) {
              void prefetchCollectionPage();
            } else if (link.to === "/about") {
              void prefetchAboutPage();
            } else if (link.to === "/faq") {
              void prefetchFaqPage();
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
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default MobileNav;
