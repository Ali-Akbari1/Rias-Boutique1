import { useState } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ProductGrid from "@/components/ProductGrid";
import AboutSection from "@/components/AboutSection";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";

const Index = () => {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setCartOpen(true)} />
      <HeroSection />
      <ProductGrid />
      <AboutSection />
      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default Index;
