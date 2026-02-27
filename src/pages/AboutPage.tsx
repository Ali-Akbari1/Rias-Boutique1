import { useState } from "react";
import CartDrawer from "@/features/cart/components/CartDrawer";
import Footer from "@/features/navigation/components/Footer";
import Navbar from "@/features/navigation/components/Navbar";

const AboutPage = () => {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <main className="pt-20 sm:pt-24">
        <section className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <header>
            <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Our Story</p>
            <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              About Ria&apos;s Boutique
            </h1>
          </header>

          <div className="mt-6 space-y-4 text-base font-body leading-relaxed text-muted-foreground sm:text-lg">
            <p>
              Founded in Canada, our women-owned business was created to honor Afghan craftsmanship while empowering
              the talented men and women behind every stitch.
            </p>
            <p>
              We are proud to bring authentic Afghan designs to a modern global audience while staying true to their
              traditional roots.
            </p>
            <p>
              Each garment is more than clothing. It is a wearable work of art designed for people who carry
              tradition with confidence, grace, and pride.
            </p>
          </div>
        </section>
      </main>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default AboutPage;
