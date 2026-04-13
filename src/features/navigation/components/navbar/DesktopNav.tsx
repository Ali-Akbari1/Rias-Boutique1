import { Link } from "react-router-dom";
import { prefetchAboutPage, prefetchCollectionPage, prefetchFaqPage } from "@/lib/prefetch";
import { getPrimaryNavLinks, type PrimaryNavState } from "./nav-links";

const desktopNavLinkClass = (isActive: boolean) =>
  `relative inline-flex items-center py-2 text-[0.95rem] font-semibold tracking-[0.04em] transition-colors after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-center after:bg-foreground after:transition-transform after:duration-200 after:ease-out ${
    isActive
      ? "text-foreground after:scale-x-100"
      : "text-muted-foreground after:scale-x-0 hover:text-foreground hover:after:scale-x-100"
  }`;

const DesktopNav = (state: PrimaryNavState) => {
  const links = getPrimaryNavLinks(state);

  return (
    <div className="hidden items-center justify-self-center gap-7 font-body md:flex lg:gap-8">
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
            className={desktopNavLinkClass(link.isActive)}
            onMouseEnter={handlePrefetch}
            onFocus={handlePrefetch}
            aria-current={link.isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
};

export default DesktopNav;
