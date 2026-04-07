import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface CartDrawerContextValue {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  setOpen: (nextOpen: boolean) => void;
}

const CartDrawerContext = createContext<CartDrawerContextValue | undefined>(undefined);

export const CartDrawerProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({
      isOpen,
      openDrawer,
      closeDrawer,
      setOpen: setIsOpen,
    }),
    [closeDrawer, isOpen, openDrawer],
  );

  return <CartDrawerContext.Provider value={value}>{children}</CartDrawerContext.Provider>;
};

export const useCartDrawer = () => {
  const context = useContext(CartDrawerContext);
  if (!context) {
    throw new Error("useCartDrawer must be used within a CartDrawerProvider");
  }

  return context;
};
