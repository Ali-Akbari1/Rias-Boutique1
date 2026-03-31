import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { type Product } from "@/features/catalog/data/products";
import { useCart } from "@/features/cart/context/CartContext";
import { useCurrency } from "@/features/currency/context/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { isCheckoutEnabled } from "@/lib/checkout";
import { rememberCollectionScrollPosition } from "@/lib/collection-scroll";
import { prefetchProductDetailsPage } from "@/lib/prefetch";
import BagIcon from "@/shared/ui/BagIcon";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const location = useLocation();
  const isSoldOut = product.availability === "sold_out";
  const isOnSale = !isSoldOut && Boolean(product.salePercent && product.compareAtPrice);
  const checkoutEnabled = isCheckoutEnabled();
  const { addToCart } = useCart();
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const [addState, setAddState] = useState<"idle" | "adding" | "added">("idle");
  const addTimerRef = useRef<number | null>(null);
  const addedTimerRef = useRef<number | null>(null);
  const returnTo = `${location.pathname}${location.search}`;
  const detailsPath = `/products/${product.id}?returnTo=${encodeURIComponent(returnTo)}`;
  const handleOpenDetails = () => {
    rememberCollectionScrollPosition({
      pathname: location.pathname,
      search: location.search,
      scrollY: window.scrollY,
    });
  };

  const canDirectAdd = product.sizes.length === 1 && product.colors.length === 1;

  useEffect(() => {
    return () => {
      if (addTimerRef.current) {
        window.clearTimeout(addTimerRef.current);
      }
      if (addedTimerRef.current) {
        window.clearTimeout(addedTimerRef.current);
      }
    };
  }, []);

  const triggerAddFeedback = () => {
    setAddState("adding");
    if (addTimerRef.current) {
      window.clearTimeout(addTimerRef.current);
    }
    if (addedTimerRef.current) {
      window.clearTimeout(addedTimerRef.current);
    }
    addTimerRef.current = window.setTimeout(() => {
      setAddState("added");
      addTimerRef.current = null;
      addedTimerRef.current = window.setTimeout(() => {
        setAddState("idle");
        addedTimerRef.current = null;
      }, 900);
    }, 350);
  };

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
    triggerAddFeedback();
    toast({
      title: "Added to bag",
      description: `${product.name} (${size}, ${color}) was added to your bag.`,
    });
  };

  const isAdding = addState === "adding";
  const isAdded = addState === "added";

  return (
    <div className="group relative mx-auto flex h-full min-w-0 w-full max-w-[23.5rem] flex-col overflow-hidden rounded-sm bg-card shadow-boutique transition-all duration-500 hover:shadow-boutique">
      <div className="aspect-[3/4] overflow-hidden">
        {isSoldOut ? (
          <span className="absolute left-3 top-3 z-10 rounded-sm bg-foreground/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-background">
            Sold Out
          </span>
        ) : isOnSale ? (
          <span className="absolute left-3 top-3 z-10 rounded-sm bg-red-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
            Sale {product.salePercent}% OFF
          </span>
        ) : null}
        <Link
          to={detailsPath}
          className="block h-full w-full"
          onClick={handleOpenDetails}
          onMouseEnter={() => void prefetchProductDetailsPage()}
          onFocus={() => void prefetchProductDetailsPage()}
        >
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          />
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
        <p className="mb-1 text-xs font-body uppercase tracking-[0.2em] text-gold">{product.category}</p>
        <h3 className="mb-0.5 line-clamp-2 break-words font-display text-base font-semibold leading-tight text-foreground sm:text-lg">
          {product.name}
        </h3>
        <p className="mb-1 line-clamp-2 break-words text-xs font-body leading-snug text-muted-foreground sm:text-sm">
          {product.description}
        </p>

        <div className="mb-1.5 flex items-end gap-2">
          <p className="font-display text-lg font-bold text-foreground sm:text-xl">{formatPrice(product.price)}</p>
          {isOnSale ? (
            <p className="text-xs font-body text-muted-foreground line-through sm:text-sm">
              {formatPrice(product.compareAtPrice ?? 0)}
            </p>
          ) : null}
        </div>

        <p className="mb-1 text-left text-xs font-body text-muted-foreground">Select size and color on product page</p>

        <div className="mt-auto pt-1.5">
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleAddToBag}
              disabled={isSoldOut || isAdding || isAdded}
              className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-sm border border-border px-2.5 py-1.5 text-xs font-body font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm"
            >
              {isSoldOut ? (
                <>
                  <BagIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Sold Out
                </>
              ) : isAdded ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 sm:h-4 sm:w-4" />
                  Added
                </>
              ) : (
                <>
                  <BagIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  {isAdding ? "Adding..." : "Add to Bag"}
                </>
              )}
            </button>
            <Link
              to={detailsPath}
              onClick={handleOpenDetails}
              onMouseEnter={() => void prefetchProductDetailsPage()}
              onFocus={() => void prefetchProductDetailsPage()}
              className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 text-xs font-body text-primary-foreground transition-colors hover:bg-burgundy-light sm:text-sm"
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

