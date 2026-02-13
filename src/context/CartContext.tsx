import { createContext, useContext, useState, type ReactNode } from "react";
import { type Product } from "@/data/products";

export interface ProductSelection {
  size: string;
  color: string;
}

export interface CartItem {
  id: string;
  product: Product;
  selection: ProductSelection;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, selection: ProductSelection) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const buildCartItemId = (productId: string, selection: ProductSelection) =>
  `${productId}-${selection.size}-${selection.color}`;

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = (product: Product, selection: ProductSelection) => {
    setItems((prev) => {
      const itemId = buildCartItemId(product.id, selection);
      const existing = prev.find((item) => item.id === itemId);

      if (existing) {
        return prev.map((item) => (item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item));
      }

      return [...prev, { id: itemId, product, selection, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, quantity } : item)));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
};
