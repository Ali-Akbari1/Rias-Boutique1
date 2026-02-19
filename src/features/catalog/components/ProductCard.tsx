import { Link } from "react-router-dom";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { type Product } from "@/features/catalog/data/products";
import { useCart } from "@/features/cart/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import { isCheckoutEnabled } from "@/lib/checkout";
import { formatCad } from "@/lib/money";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const isSoldOut = product.availability === "sold_out";
  const checkoutEnabled = isCheckoutEnabled();
  const { addToCart } = useCart();
  const { toast } = useToast();

  const canDirectAdd = product.sizes.length === 1 && product.colors.length === 1;

  const handleAddToBag = () => {
    if (isSoldOut) {
      toast({
        title: "Sold out",
        description: "This item is currently sold out and cannot be added to your bag.",
        variant: "destructive",
      });
      return;
    }

    if (!checkoutEnabled) {
      toast({
        title: "Checkout coming soon",
        description: "Ordering is temporarily disabled while we finalize checkout.",
      });
      return;
    }

    if (!canDirectAdd) {
      toast({
        title: "Select size and color",
        description: "Please open View Details to choose size and color before adding this item to your bag.",
        variant: "destructive",
      });
      return;
    }

    const size = product.sizes[0];
    const color = product.colors[0];

    if (!size || !color) {
      toast({
        title: "Select size and color",
        description: "Please open View Details to choose size and color before adding this item to your bag.",
        variant: "destructive",
      });
      return;
    }

    addToCart(product, { size, color });
    toast({
      title: "Added to bag",
      description: `${product.name} (${size}, ${color}) was added to your bag.`,
    });
  };

  return (
    <div className="group relative mx-auto w-full max-w-[27.5rem] overflow-hidden rounded-sm bg-card shadow-boutique transition-all duration-500 hover:shadow-card-hover">
      <div className="aspect-[3/4] overflow-hidden">
        {isSoldOut ? (
          <span className="absolute left-3 top-3 z-10 rounded-sm bg-foreground/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-background">
            Sold Out
          </span>
        ) : null}
        <Link to={`/products/${product.id}`} className="block h-full w-full">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          />
        </Link>
      </div>

      <div className="p-3.5 sm:p-4">
        <p className="mb-1 text-xs font-body uppercase tracking-[0.2em] text-gold">{product.category}</p>
        <h3 className="mb-1 font-display text-base font-semibold text-foreground sm:text-lg">{product.name}</h3>
        <p className="mb-2 line-clamp-2 text-xs font-body text-muted-foreground sm:text-sm">{product.description}</p>

        <p className="mb-3 font-display text-lg font-bold text-foreground sm:text-xl">{formatCad(product.price)}</p>

        <div className="space-y-1.5">
          <p className="text-xs font-body text-muted-foreground">Select size and color on product page</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddToBag}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2.5 py-1.5 text-xs font-body font-semibold text-foreground transition-colors hover:bg-secondary sm:text-sm"
            >
              <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {isSoldOut ? "Sold Out" : "Add to Bag"}
            </button>
            <Link
              to={`/products/${product.id}`}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 text-xs font-body text-primary-foreground transition-colors hover:bg-burgundy-light sm:text-sm"
            >
              View Details
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;

