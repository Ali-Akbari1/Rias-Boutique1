import { useState } from "react";
import Navbar from "@/features/navigation/components/Navbar";
import HeroSection from "@/features/home/components/HeroSection";
import LaunchDiscountPopup from "@/features/home/components/LaunchDiscountPopup";
import FeaturedProductsCarousel from "@/features/catalog/components/FeaturedProductsCarousel";
import TrustSection from "@/features/home/components/TrustSection";
import InstagramSection from "@/features/home/components/InstagramSection";
import Footer from "@/features/navigation/components/Footer";
import CartDrawer from "@/features/cart/components/CartDrawer";

const Index = () => {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setCartOpen(true)} />
      <LaunchDiscountPopup />
      <HeroSection />
      <FeaturedProductsCarousel />
      <TrustSection />
      <InstagramSection />
      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default Index;

