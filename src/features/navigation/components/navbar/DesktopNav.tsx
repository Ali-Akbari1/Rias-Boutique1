import { Link } from "react-router-dom";
import { prefetchAboutPage, prefetchCollectionPage, prefetchFaqPage } from "@/lib/prefetch";
import { getPrimaryNavLinks, type PrimaryNavState } from "./nav-links";

const desktopNavLinkClass = (isActive: boolean) =>
  `transition-colors hover:text-foreground hover:underline underline-offset-4 ${
    isActive ? "text-foreground underline" : "text-muted-foreground"
  }`;

const DesktopNav = (state: PrimaryNavState) => {
  const links = getPrimaryNavLinks(state);

  return (
    <div className="justify-self-center hidden items-center gap-8 font-body text-lg md:flex">
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
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
};

export default DesktopNav;
