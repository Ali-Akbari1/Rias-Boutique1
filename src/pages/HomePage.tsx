import { useState } from "react";
import Navbar from "@/features/navigation/components/Navbar";
import HeroSection from "@/features/home/components/HeroSection";
import ProductGrid from "@/features/catalog/components/ProductGrid";
import TrustSection from "@/features/home/components/TrustSection";
import InstagramSection from "@/features/home/components/InstagramSection";
import AboutSection from "@/features/home/components/AboutSection";
import Footer from "@/features/navigation/components/Footer";
import CartDrawer from "@/features/cart/components/CartDrawer";

const Index = () => {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setCartOpen(true)} />
      <HeroSection />
      <ProductGrid />
      <TrustSection />
      <InstagramSection />
      <AboutSection />
      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default Index;

