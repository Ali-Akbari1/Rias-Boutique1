import { useState } from "react";
import { faqItems } from "@/features/store/data/store-content";
import CartDrawer from "@/features/cart/components/CartDrawer";
import Footer from "@/features/navigation/components/Footer";
import Navbar from "@/features/navigation/components/Navbar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

const FaqPage = () => {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <main className="pt-28 sm:pt-32">
        <section className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <header>
            <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Support</p>
            <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              Frequently Asked Questions
            </h1>
          </header>

          <Card className="mt-8">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-2xl">Orders, Shipping & Returns</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Accordion type="single" collapsible className="w-full">
                {faqItems.map((faq) => (
                  <AccordionItem key={faq.id} value={faq.id}>
                    <AccordionTrigger className="text-left font-semibold text-foreground">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="font-body text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default FaqPage;
