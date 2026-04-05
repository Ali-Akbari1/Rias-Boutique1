import { useState } from "react";
import CartDrawer from "@/features/cart/components/CartDrawer";
import Footer from "@/features/navigation/components/Footer";
import Navbar from "@/features/navigation/components/Navbar";
import { getStorePickupDetails } from "@/features/store/data/store-content";

const LocationPage = () => {
  const [cartOpen, setCartOpen] = useState(false);
  const pickupDetails = getStorePickupDetails();

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <main className="pt-28 sm:pt-32">
        <section className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <header>
            <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Visit Us</p>
            <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              Ria&apos;s Boutique in Balzac
            </h1>
            <p className="mt-3 text-base font-body text-muted-foreground sm:text-lg">
              Shop in person or pick up your online order at our Balzac location.
            </p>
          </header>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-card/60 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Address</p>
              <p className="mt-3 text-base font-body text-foreground">{pickupDetails.address}</p>
              <a
                className="mt-4 inline-flex text-sm font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-gold"
                href={pickupDetails.mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            </div>

            <div className="rounded-lg border border-border/70 bg-card/60 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Phone</p>
              <a
                className="mt-3 inline-flex text-base font-body text-foreground underline underline-offset-4 transition-colors hover:text-gold"
                href={`tel:${pickupDetails.phoneHref}`}
              >
                {pickupDetails.phoneDisplay}
              </a>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hours</p>
              <ul className="mt-3 space-y-1 text-sm font-body text-muted-foreground">
                {pickupDetails.hours.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default LocationPage;
