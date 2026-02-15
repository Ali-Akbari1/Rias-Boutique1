import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CartProvider } from "@/context/CartContext";
import ScrollToTop from "@/components/ScrollToTop";
import { isCheckoutEnabled } from "@/lib/checkout";
import Index from "./pages/Index";
import Checkout from "./pages/Checkout";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCancel from "./pages/CheckoutCancel";
import ProductDetails from "./pages/ProductDetails";
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
              <Route path="/" element={<Index />} />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
