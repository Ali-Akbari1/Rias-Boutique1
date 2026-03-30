import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { track } from "@vercel/analytics/react";
import { getProductById, type Product } from "@/features/catalog/data/products";
import { getMaxQuantityForProduct } from "@/features/cart/context/cart-quantity";

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
const CART_STORAGE_KEY = "rias_boutique_cart_v1";

const buildCartItemId = (productId: string, selection: ProductSelection) =>
  `${productId}-${selection.size}-${selection.color}`;

const isValidSelection = (value: unknown): value is ProductSelection =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ProductSelection).size === "string" &&
  (value as ProductSelection).size.trim().length > 0 &&
  typeof (value as ProductSelection).color === "string" &&
  (value as ProductSelection).color.trim().length > 0;

const isValidProduct = (value: unknown): value is Product =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Product).id === "string" &&
  typeof (value as Product).name === "string" &&
  typeof (value as Product).price === "number";

const isValidCartItem = (value: unknown): value is CartItem =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CartItem).id === "string" &&
  Number.isInteger((value as CartItem).quantity) &&
  (value as CartItem).quantity > 0 &&
  isValidProduct((value as CartItem).product) &&
  isValidSelection((value as CartItem).selection);

const restoreCartFromStorage = (): CartItem[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const merged = new Map<string, CartItem>();
    for (const candidate of parsed) {
      if (!isValidCartItem(candidate)) {
        continue;
      }

      const resolvedProduct = getProductById(candidate.product.id) || candidate.product;
      const maxQuantity = getMaxQuantityForProduct(resolvedProduct);
      if (maxQuantity <= 0) {
        continue;
      }

      const normalizedQuantity = Math.min(maxQuantity, candidate.quantity);
      if (normalizedQuantity <= 0) {
        continue;
      }
      const existing = merged.get(candidate.id);
      if (existing) {
        existing.quantity = Math.min(maxQuantity, existing.quantity + normalizedQuantity);
      } else {
        merged.set(candidate.id, {
          ...candidate,
          product: resolvedProduct,
          quantity: normalizedQuantity,
        });
      }
    }

    return Array.from(merged.values());
  } catch {
    return [];
  }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(() => restoreCartFromStorage());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addToCart = (product: Product, selection: ProductSelection) => {
    let didAdd = false;
    setItems((prev) => {
      const maxQuantity = getMaxQuantityForProduct(product);
      if (maxQuantity <= 0) {
        return prev;
      }

      const itemId = buildCartItemId(product.id, selection);
      const existing = prev.find((item) => item.id === itemId);

      if (existing) {
        return prev;
      }

      didAdd = true;
      return [...prev, { id: itemId, product, selection, quantity: Math.min(1, maxQuantity) }];
    });

    if (didAdd) {
      track("Add to Cart", {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        size: selection.size,
        color: selection.color,
        category: product.category,
      });
    }
  };

  const removeFromCart = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    setItems((prev) => {
      const target = prev.find((item) => item.id === itemId);
      if (!target) {
        return prev;
      }

      const maxQuantity = getMaxQuantityForProduct(target.product);
      if (maxQuantity <= 0) {
        return prev.filter((item) => item.id !== itemId);
      }

      const nextQuantity = Math.min(quantity, maxQuantity);
      if (nextQuantity <= 0) {
        return prev.filter((item) => item.id !== itemId);
      }

      return prev.map((item) => (item.id === itemId ? { ...item, quantity: nextQuantity } : item));
    });
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

