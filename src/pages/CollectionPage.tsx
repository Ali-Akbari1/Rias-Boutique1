import { useState } from "react";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import ProductGrid from "@/features/catalog/components/ProductGrid";
import CartDrawer from "@/features/cart/components/CartDrawer";
import Footer from "@/features/navigation/components/Footer";
import { useCart } from "@/features/cart/context/CartContext";

const CollectionPage = () => {
  const [cartOpen, setCartOpen] = useState(false);
  const { totalItems } = useCart();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative rounded-sm p-2 text-foreground transition-colors hover:text-gold"
            aria-label="Shopping cart"
          >
            <ShoppingBag className="h-6 w-6" />
            {totalItems > 0 ? (
              <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {totalItems}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <main>
        <ProductGrid />
      </main>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default CollectionPage;
