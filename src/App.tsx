import { Toaster } from "@/shared/ui/toaster";
import { Toaster as Sonner } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CartProvider } from "@/features/cart/context/CartContext";
import ScrollToTop from "@/features/navigation/components/ScrollToTop";
import { isCheckoutEnabled } from "@/lib/checkout";
import HomePage from "./pages/HomePage";
import Checkout from "./pages/Checkout";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCancel from "./pages/CheckoutCancel";
import AdminOrders from "./pages/AdminOrders";
import ProductDetails from "./pages/ProductDetails";
import CollectionPage from "./pages/CollectionPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const checkoutEnabled = isCheckoutEnabled();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/collection" element={<CollectionPage />} />
              <Route path="/collection/:department" element={<CollectionPage />} />
              <Route path="/products/:productId" element={<ProductDetails />} />
              <Route
                path="/checkout"
                element={checkoutEnabled ? <Checkout /> : <Navigate to="/" replace />}
              />
              <Route
                path="/checkout/success"
                element={checkoutEnabled ? <CheckoutSuccess /> : <Navigate to="/" replace />}
              />
              <Route
                path="/checkout/cancel"
                element={checkoutEnabled ? <CheckoutCancel /> : <Navigate to="/" replace />}
              />
              <Route path="/orders-admin" element={<AdminOrders />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;



