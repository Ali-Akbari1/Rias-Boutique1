import { Link } from "react-router-dom";
import { getPrimaryNavLinks, type PrimaryNavState } from "./nav-links";

const desktopNavLinkClass = (isActive: boolean) =>
  `transition-colors hover:text-foreground hover:underline underline-offset-4 ${
    isActive ? "text-foreground underline" : "text-muted-foreground"
  }`;

const DesktopNav = (state: PrimaryNavState) => {
  const links = getPrimaryNavLinks(state);

  return (
    <div className="justify-self-center hidden items-center gap-8 font-body text-lg md:flex">
      {links.map((link) => (
        <Link key={link.to} to={link.to} className={desktopNavLinkClass(link.isActive)}>
          {link.label}
        </Link>
      ))}
    </div>
  );
};

export default DesktopNav;
