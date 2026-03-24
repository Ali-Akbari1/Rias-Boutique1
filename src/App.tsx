import { Suspense, lazy } from "react";
import { Toaster } from "@/shared/ui/toaster";
import { Toaster as Sonner } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { CartProvider } from "@/features/cart/context/CartContext";
import LaunchDiscountPopup from "@/features/home/components/LaunchDiscountPopup";
import RouteMetadata from "@/features/navigation/components/RouteMetadata";
import ScrollToTop from "@/features/navigation/components/ScrollToTop";
import { resolveCanonicalPath } from "@/features/navigation/route-manifest";
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
const AboutPage = lazy(() => import("./pages/AboutPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));

const AnalyticsTracker = () => {
  const location = useLocation();
  const route = resolveCanonicalPath(location.pathname, location.search);
  const path = `${location.pathname}${location.search}`;

  return <Analytics route={route} path={path} />;
};

const App = () => {
  const checkoutEnabled = isCheckoutEnabled();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <LaunchDiscountPopup />
            <RouteMetadata />
            <ScrollToTop />
            <AnalyticsTracker />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/collection" element={<CollectionPage />} />
              <Route path="/collection/:department" element={<CollectionPage />} />
              <Route
                path="/about"
                element={
                  <Suspense fallback={null}>
                    <AboutPage />
                  </Suspense>
                }
              />
              <Route
                path="/faq"
                element={
                  <Suspense fallback={null}>
                    <FaqPage />
                  </Suspense>
                }
              />
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



