/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { track } from "@vercel/analytics/react";
import { getProductById, type Product } from "@/features/catalog/data/products";
import { getMaxQuantityForProduct } from "@/features/cart/context/cart-quantity";
import { type CartItem, type ProductSelection } from "@/features/cart/context/cart-types";

export type CartAddResult = "added" | "already_in_cart" | "sold_out";

interface CartStateContextType {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  isAdding: boolean;
  lastAddedItem: CartItem | null;
}

interface CartActionsContextType {
  addToCart: (product: Product, selection: ProductSelection) => CartAddResult;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
}

const CartStateContext = createContext<CartStateContextType | undefined>(undefined);
const CartActionsContext = createContext<CartActionsContextType | undefined>(undefined);
const CART_STORAGE_KEY = "rias_boutique_cart_v1";
const ADD_FEEDBACK_DURATION_MS = 800;

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
  const [isAdding, setIsAdding] = useState(false);
  const [lastAddedItem, setLastAddedItem] = useState<CartItem | null>(null);
  const addFeedbackTimeoutRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  const pendingAddItemIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    itemsRef.current = items;
    for (const item of items) {
      pendingAddItemIdsRef.current.delete(item.id);
    }
  }, [items]);

  useEffect(() => {
    return () => {
      if (addFeedbackTimeoutRef.current) {
        window.clearTimeout(addFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const addToCart = useCallback((product: Product, selection: ProductSelection): CartAddResult => {
    const maxQuantity = getMaxQuantityForProduct(product);
    if (maxQuantity <= 0) {
      return "sold_out";
    }

    const itemId = buildCartItemId(product.id, selection);
    if (pendingAddItemIdsRef.current.has(itemId) || itemsRef.current.some((item) => item.id === itemId)) {
      return "already_in_cart";
    }

    const nextItem: CartItem = {
      id: itemId,
      product,
      selection,
      quantity: Math.min(1, maxQuantity),
    };

    pendingAddItemIdsRef.current.add(itemId);
    setItems((prev) => {
      if (prev.some((item) => item.id === itemId)) {
        return prev;
      }
      return [...prev, nextItem];
    });

    setLastAddedItem(nextItem);
    setIsAdding(true);
    if (addFeedbackTimeoutRef.current) {
      window.clearTimeout(addFeedbackTimeoutRef.current);
    }
    addFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsAdding(false);
      addFeedbackTimeoutRef.current = null;
    }, ADD_FEEDBACK_DURATION_MS);

    track("Add to Cart", {
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      size: selection.size,
      color: selection.color,
      category: product.category,
    });

    return "added";
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    pendingAddItemIdsRef.current.delete(itemId);
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
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
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    pendingAddItemIdsRef.current.clear();
    setLastAddedItem(null);
    setItems([]);
  }, []);

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const totalPrice = useMemo(() => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [items]);
  const stateValue = useMemo<CartStateContextType>(
    () => ({
      items,
      totalItems,
      totalPrice,
      isAdding,
      lastAddedItem,
    }),
    [isAdding, items, lastAddedItem, totalItems, totalPrice],
  );
  const actionsValue = useMemo<CartActionsContextType>(
    () => ({
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
    }),
    [addToCart, clearCart, removeFromCart, updateQuantity],
  );

  return (
    <CartStateContext.Provider value={stateValue}>
      <CartActionsContext.Provider value={actionsValue}>{children}</CartActionsContext.Provider>
    </CartStateContext.Provider>
  );
};

export const useCartState = () => {
  const context = useContext(CartStateContext);
  if (!context) {
    throw new Error("useCartState must be used within a CartProvider");
  }

  return context;
};

export const useCartActions = () => {
  const context = useContext(CartActionsContext);
  if (!context) {
    throw new Error("useCartActions must be used within a CartProvider");
  }

  return context;
};

export const useCart = () => {
  const state = useCartState();
  const actions = useCartActions();

  return useMemo(
    () => ({
      ...state,
      ...actions,
    }),
    [actions, state],
  );
};

