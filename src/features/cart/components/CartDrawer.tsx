import { useEffect, useMemo, useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ProductRecommendationRail from "@/features/catalog/components/ProductRecommendationRail";
import { formatProductSelectionSummary } from "@/features/catalog/data/products";
import { getCartRecommendations } from "@/features/catalog/lib/recommendations";
import { getMaxQuantityForProduct } from "@/features/cart/context/cart-quantity";
import { useCart } from "@/features/cart/context/CartContext";
import { useCurrency } from "@/features/currency/context/useCurrency";
import { isCheckoutEnabled } from "@/lib/checkout";
import { formatProductAlt } from "@/lib/seo";
import BagIcon from "@/shared/ui/BagIcon";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

const FREE_SHIPPING_THRESHOLD_CAD = 400;
const OPEN_ANIMATION_DURATION_MS = 280;
const CLOSE_ANIMATION_DURATION_MS = 220;

const CartDrawer = ({ open, onClose }: CartDrawerProps) => {
  const { items, removeFromCart, updateQuantity, totalItems, totalPrice, clearCart, isAdding, lastAddedItem } =
    useCart();
  const navigate = useNavigate();
  const checkoutEnabled = isCheckoutEnabled();
  const { formatPrice, isUsd } = useCurrency();
  const freeShippingRemainingCad = Math.max(0, FREE_SHIPPING_THRESHOLD_CAD - totalPrice);
  const qualifiesForFreeShipping = totalPrice >= FREE_SHIPPING_THRESHOLD_CAD;
  const freeShippingProgress = Math.min(1, totalPrice / FREE_SHIPPING_THRESHOLD_CAD);
  const [isMounted, setIsMounted] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const recommendedProducts = useMemo(
    () => getCartRecommendations(items.map((item) => item.product), { limit: 4 }),
    [items],
  );
  const lastAddedSelectionSummary = lastAddedItem
    ? formatProductSelectionSummary(lastAddedItem.product, lastAddedItem.selection)
    : "";

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      setIsClosing(false);
      return;
    }

    if (isMounted) {
      setIsClosing(true);
      const timeout = window.setTimeout(() => {
        setIsMounted(false);
        setIsClosing(false);
      }, CLOSE_ANIMATION_DURATION_MS);

      return () => window.clearTimeout(timeout);
    }
  }, [open, isMounted]);

  const handleCheckout = () => {
    if (!checkoutEnabled) {
      return;
    }
    onClose();
    navigate("/checkout");
  };

  if (!isMounted) return null;

  return (
    <>
      <div className="fixed inset-0 bg-foreground/20 backdrop-blur-[1px] z-50" onClick={onClose} />
      <div
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-full transform-gpu flex-col bg-background shadow-2xl will-change-transform sm:max-w-md ${
          isClosing ? "animate-slide-out" : "animate-slide-in"
        }`}
        style={{ animationDuration: `${isClosing ? CLOSE_ANIMATION_DURATION_MS : OPEN_ANIMATION_DURATION_MS}ms` }}
      >
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-6">
          <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">Your Bag</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-muted-foreground">
            <BagIcon className="h-16 w-16 opacity-30" />
            <p className="font-body text-lg">Your bag is empty</p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
              {items.map(({ id, product, selection, quantity }) => {
                const maxQuantity = getMaxQuantityForProduct(product);
                const isMaxQuantity = maxQuantity <= 0 || quantity >= maxQuantity;
                const unitPrice = product.price ?? 0;
                const selectionSummary = formatProductSelectionSummary(product, selection);

                return (
                  <div key={id} className="flex gap-3 sm:gap-4">
                    <img
                      src={product.image}
                      alt={formatProductAlt(product)}
                      className="h-20 w-16 rounded-sm object-cover sm:h-24 sm:w-20"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display truncate font-semibold text-foreground">{product.name}</h3>
                      <p className="text-sm text-muted-foreground font-body">{formatPrice(unitPrice)}</p>
                      {selectionSummary ? (
                        <p className="mt-1 text-xs font-body text-muted-foreground">{selectionSummary}</p>
                      ) : null}
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          onClick={() => updateQuantity(id, quantity - 1)}
                          className="h-8 w-8 rounded-sm border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-body text-sm text-foreground">{quantity}</span>
                        <button
                          onClick={() => updateQuantity(id, quantity + 1)}
                          disabled={isMaxQuantity}
                          title={isMaxQuantity ? (maxQuantity <= 0 ? "Sold out" : `Limit ${maxQuantity} per item`) : "Increase quantity"}
                          className={`h-8 w-8 rounded-sm border border-border flex items-center justify-center text-foreground transition-colors ${
                            isMaxQuantity ? "cursor-not-allowed opacity-40" : "hover:bg-secondary"
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <span className="font-display text-sm font-bold text-foreground sm:text-base">
                        {formatPrice(unitPrice * quantity)}
                      </span>
                      <button
                        onClick={() => removeFromCart(id)}
                        className="text-xs text-muted-foreground hover:text-destructive font-body transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              {recommendedProducts.length > 0 ? (
                <div className="border-t border-border/70 pt-5">
                  <ProductRecommendationRail
                    compact
                    title="Before You Go"
                    description="A few more pieces worth a quick look before checkout."
                    products={recommendedProducts}
                    onProductClick={onClose}
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-4 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {isAdding && lastAddedItem ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 sm:p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Product added</p>
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={lastAddedItem.product.image}
                      alt={formatProductAlt(lastAddedItem.product)}
                      className="h-14 w-11 rounded-sm object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-semibold text-foreground">
                        {lastAddedItem.product.name}
                      </p>
                      {lastAddedSelectionSummary ? (
                        <p className="text-xs font-body text-muted-foreground">{lastAddedSelectionSummary}</p>
                      ) : null}
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {formatPrice((lastAddedItem.product.price ?? 0) * lastAddedItem.quantity)}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <span>Cart summary</span>
                  <span>
                    {totalItems} item{totalItems === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="font-body text-sm text-muted-foreground">Total</span>
                  <span className="font-display text-2xl font-bold text-foreground">{formatPrice(totalPrice)}</span>
                </div>
                {isUsd ? (
                  <p className="text-xs font-body text-muted-foreground">
                    USD totals are estimates. Final charges are processed in CAD at checkout.
                  </p>
                ) : null}
                <button
                  onClick={handleCheckout}
                  disabled={!checkoutEnabled}
                  className="w-full rounded-sm border border-foreground bg-background px-4 py-3.5 font-body text-base font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground sm:py-4 sm:text-lg"
                >
                  {checkoutEnabled ? "Checkout" : "Checkout Coming Soon"}
                </button>
                <div className="rounded-md border border-border/70 bg-card/40 p-3">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <span>Free Shipping</span>
                    <span>
                      {formatPrice(Math.min(totalPrice, FREE_SHIPPING_THRESHOLD_CAD))} /{" "}
                      {formatPrice(FREE_SHIPPING_THRESHOLD_CAD)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground transition-all duration-300"
                      style={{ width: `${freeShippingProgress * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-body text-muted-foreground">
                    {qualifiesForFreeShipping
                      ? "You qualify for free shipping"
                      : `You're ${formatPrice(freeShippingRemainingCad)} away from free shipping`}
                  </p>
                  {isUsd ? (
                    <p className="text-[11px] font-body text-muted-foreground">
                      Threshold is CA$400 (USD shown is an estimate).
                    </p>
                  ) : (
                    <p className="text-[11px] font-body text-muted-foreground">
                      Applies to Canada & US orders over CA$400.
                    </p>
                  )}
                </div>
                <button
                  onClick={clearCart}
                  className="w-full text-center text-sm text-muted-foreground font-body hover:text-foreground transition-colors"
                >
                  Clear Bag
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default CartDrawer;
