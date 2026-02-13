import { ShoppingBag } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useCart } from "@/context/CartContext";

interface NavbarProps {
  onCartClick: () => void;
}

const Navbar = ({ onCartClick }: NavbarProps) => {
  const { totalItems } = useCart();
  const { pathname } = useLocation();

  const handleHomeClick = () => {
    if (pathname === "/") {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Link
          to="/"
          onClick={handleHomeClick}
          className="flex items-center gap-2 rounded-sm text-xl font-display font-bold tracking-wide text-foreground transition-colors hover:text-gold sm:text-2xl"
          aria-label="Go to homepage"
        >
          <span>
            Ria&apos;s <span className="text-gold">Boutique</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 font-body text-lg">
          <a href="#collection" className="text-muted-foreground hover:text-foreground transition-colors">
            Collection
          </a>
          <a href="#reviews" className="text-muted-foreground hover:text-foreground transition-colors">
            Reviews
          </a>
          <a href="#instagram" className="text-muted-foreground hover:text-foreground transition-colors">
            Instagram
          </a>
          <a href="#about" className="text-muted-foreground hover:text-foreground transition-colors">
            About
          </a>
          <a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">
            Contact
          </a>
        </div>

        <button
          onClick={onCartClick}
          className="relative rounded-sm p-2 text-foreground transition-colors hover:text-gold"
          aria-label="Shopping cart"
        >
          <ShoppingBag className="w-6 h-6" />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-body font-semibold">
              {totalItems}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
