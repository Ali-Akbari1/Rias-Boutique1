import { Suspense, lazy } from "react";
import { Toaster } from "@/shared/ui/toaster";
import { Toaster as Sonner } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { CartProvider } from "@/features/cart/context/CartContext";
import { CurrencyProvider } from "@/features/currency/context/CurrencyContext";
import LaunchDiscountPopup from "@/features/home/components/LaunchDiscountPopup";
import RouteMetadata from "@/features/navigation/components/RouteMetadata";
import ScrollToTop from "@/features/navigation/components/ScrollToTop";
import { resolveCanonicalPath } from "@/features/navigation/route-manifest";
import { isCheckoutEnabled } from "@/lib/checkout";
import PageSkeleton from "@/shared/ui/page-skeleton";

const queryClient = new QueryClient();
const HomePage = lazy(() => import("./pages/HomePage"));
const CollectionPage = lazy(() => import("./pages/CollectionPage"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const Checkout = lazy(() => import("./pages/Checkout"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const CheckoutCancel = lazy(() => import("./pages/CheckoutCancel"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));
const LocationPage = lazy(() => import("./pages/LocationPage"));

const AnalyticsTracker = () => {
  const location = useLocation();
  const route = resolveCanonicalPath(location.pathname, location.search);
  const path = `${location.pathname}${location.search}`;

  return <Analytics route={route} path={path} />;
};

const SPEED_INSIGHTS_SAMPLE_RATE = 0.2;

const SpeedInsightsTracker = () => {
  const location = useLocation();
  const route = resolveCanonicalPath(location.pathname, location.search);

  return <SpeedInsights route={route} sampleRate={SPEED_INSIGHTS_SAMPLE_RATE} />;
};

const App = () => {
  const checkoutEnabled = isCheckoutEnabled();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CurrencyProvider>
          <CartProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <LaunchDiscountPopup />
              <RouteMetadata />
              <ScrollToTop />
              <AnalyticsTracker />
              <SpeedInsightsTracker />
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/collection" element={<CollectionPage />} />
                  <Route path="/collection/:department" element={<CollectionPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/faq" element={<FaqPage />} />
                  <Route path="/location" element={<LocationPage />} />
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
              </Suspense>
            </BrowserRouter>
          </CartProvider>
        </CurrencyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;



