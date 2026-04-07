import Navbar from "@/features/navigation/components/Navbar";
import HeroSection from "@/features/home/components/HeroSection";
import FeaturedProductsCarousel from "@/features/catalog/components/FeaturedProductsCarousel";
import TrustSection from "@/features/home/components/TrustSection";
import InstagramSection from "@/features/home/components/InstagramSection";
import Footer from "@/features/navigation/components/Footer";
import CartDrawer from "@/features/cart/components/CartDrawer";
import { useCartDrawer } from "@/features/cart/context/CartDrawerContext";

const Index = () => {
  const { isOpen, openDrawer, closeDrawer } = useCartDrawer();

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={openDrawer} />
      <HeroSection />
      <FeaturedProductsCarousel />
      <TrustSection />
      <InstagramSection />
      <Footer />
      <CartDrawer open={isOpen} onClose={closeDrawer} />
    </div>
  );
};

export default Index;

