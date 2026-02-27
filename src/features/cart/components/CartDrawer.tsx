import { X, Minus, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/features/cart/context/CartContext";
import { isCheckoutEnabled } from "@/lib/checkout";
import { formatCad } from "@/lib/money";
import BagIcon from "@/shared/ui/BagIcon";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

const CartDrawer = ({ open, onClose }: CartDrawerProps) => {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const checkoutEnabled = isCheckoutEnabled();

  const handleCheckout = () => {
    if (!checkoutEnabled) {
      return;
    }
    onClose();
    navigate("/checkout");
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-foreground/40 z-50" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 flex w-full flex-col bg-background shadow-2xl animate-slide-in sm:max-w-md">
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
              {items.map(({ id, product, selection, quantity }) => (
                <div key={id} className="flex gap-3 sm:gap-4">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-20 w-16 rounded-sm object-cover sm:h-24 sm:w-20"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display truncate font-semibold text-foreground">{product.name}</h3>
                    <p className="text-sm text-muted-foreground font-body">{formatCad(product.price)}</p>
                    <p className="text-xs text-muted-foreground font-body mt-1">
                      Size: {selection.size} | Color: {selection.color}
                    </p>
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
                        className="h-8 w-8 rounded-sm border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <span className="font-display text-sm font-bold text-foreground sm:text-base">
                      {formatCad(product.price * quantity)}
                    </span>
                    <button
                      onClick={() => removeFromCart(id)}
                      className="text-xs text-muted-foreground hover:text-destructive font-body transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
              <div className="flex justify-between items-center">
                <span className="font-body text-lg text-muted-foreground">Total</span>
                <span className="font-display text-2xl font-bold text-foreground">{formatCad(totalPrice)}</span>
              </div>
              <button
                onClick={handleCheckout}
                disabled={!checkoutEnabled}
                className="w-full rounded-sm border border-foreground bg-background px-4 py-3.5 font-body text-base font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground sm:py-4 sm:text-lg"
              >
                {checkoutEnabled ? "Checkout" : "Checkout Coming Soon"}
              </button>
              <button
                onClick={clearCart}
                className="w-full text-center text-sm text-muted-foreground font-body hover:text-foreground transition-colors"
              >
                Clear Bag
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default CartDrawer;

