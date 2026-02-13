import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { formatUsd } from "@/lib/stripe";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

const CartDrawer = ({ open, onClose }: CartDrawerProps) => {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();

  const handleCheckout = () => {
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
            <ShoppingBag className="w-16 h-16 opacity-30" />
            <p className="font-body text-lg">Your bag is empty</p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="flex gap-3 sm:gap-4">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-20 w-16 rounded-sm object-cover sm:h-24 sm:w-20"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display truncate font-semibold text-foreground">{product.name}</h3>
                    <p className="text-sm text-muted-foreground font-body">{formatUsd(product.price)}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        className="h-8 w-8 rounded-sm border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-body text-sm text-foreground">{quantity}</span>
                      <button
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        className="h-8 w-8 rounded-sm border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <span className="font-display text-sm font-bold text-foreground sm:text-base">
                      {formatUsd(product.price * quantity)}
                    </span>
                    <button
                      onClick={() => removeFromCart(product.id)}
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
                <span className="font-display text-2xl font-bold text-foreground">{formatUsd(totalPrice)}</span>
              </div>
              <button
                onClick={handleCheckout}
                className="w-full gradient-gold text-foreground font-body font-semibold text-base sm:text-lg py-3.5 sm:py-4 rounded-sm hover:opacity-90 transition-opacity"
              >
                Checkout
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
