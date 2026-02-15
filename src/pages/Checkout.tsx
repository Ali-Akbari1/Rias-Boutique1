import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  buildStripeLineItems,
  formatCad,
  getMissingStripeProducts,
  getStripeClient,
  isStripeConfigured,
} from "@/lib/stripe";
import { faqItems, getGoogleReviewsUrl, returnPolicy, shippingPolicy } from "@/data/store";

interface CheckoutForm {
  fullName: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const initialForm: CheckoutForm = {
  fullName: "",
  email: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "United States",
};

const Checkout = () => {
  const { items, totalPrice } = useCart();
  const { toast } = useToast();
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const googleReviewsUrl = getGoogleReviewsUrl();

  const missingProducts = useMemo(() => getMissingStripeProducts(items), [items]);
  const stripeReady = isStripeConfigured(items);

  const handleFormChange = (field: keyof CheckoutForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setCheckoutForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleStripeCheckout = async (event: FormEvent) => {
    event.preventDefault();

    if (!stripeReady) {
      const missingMessage =
        missingProducts.length > 0
          ? `Missing Stripe price IDs for: ${missingProducts.join(", ")}.`
          : "Missing Stripe publishable key.";
      toast({
        title: "Stripe setup required",
        description: missingMessage,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const stripe = await getStripeClient();
      if (!stripe) {
        throw new Error("Stripe failed to initialize.");
      }

      const result = await stripe.redirectToCheckout({
        mode: "payment",
        lineItems: buildStripeLineItems(items),
        successUrl: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/checkout/cancel`,
        customerEmail: checkoutForm.email.trim(),
        submitType: "pay",
        billingAddressCollection: "required",
      });

      if (result.error) {
        throw new Error(result.error.message);
      }
    } catch (error) {
      toast({
        title: "Unable to start checkout",
        description:
          error instanceof Error ? error.message : "An unexpected error occurred while redirecting to Stripe.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  if (items.length === 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Continue Shopping
          </Link>
          <p className="font-display text-base font-semibold text-foreground sm:text-lg">Checkout</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">Secure Checkout</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Review your order and continue to Stripe for secure payment processing.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-2xl">Contact & Shipping</CardTitle>
                <CardDescription className="font-body text-base">
                  We use this information to prefill your secure Stripe checkout session.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleStripeCheckout} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="fullName" className="font-body text-sm font-semibold text-foreground">
                        Full name
                      </label>
                      <Input
                        id="fullName"
                        required
                        value={checkoutForm.fullName}
                        onChange={handleFormChange("fullName")}
                        autoComplete="name"
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="email" className="font-body text-sm font-semibold text-foreground">
                        Email
                      </label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={checkoutForm.email}
                        onChange={handleFormChange("email")}
                        autoComplete="email"
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="address" className="font-body text-sm font-semibold text-foreground">
                        Address
                      </label>
                      <Input
                        id="address"
                        required
                        value={checkoutForm.address}
                        onChange={handleFormChange("address")}
                        autoComplete="street-address"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="city" className="font-body text-sm font-semibold text-foreground">
                        City
                      </label>
                      <Input
                        id="city"
                        required
                        value={checkoutForm.city}
                        onChange={handleFormChange("city")}
                        autoComplete="address-level2"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="state" className="font-body text-sm font-semibold text-foreground">
                        State / Province
                      </label>
                      <Input
                        id="state"
                        required
                        value={checkoutForm.state}
                        onChange={handleFormChange("state")}
                        autoComplete="address-level1"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="postalCode" className="font-body text-sm font-semibold text-foreground">
                        ZIP / Postal code
                      </label>
                      <Input
                        id="postalCode"
                        required
                        value={checkoutForm.postalCode}
                        onChange={handleFormChange("postalCode")}
                        autoComplete="postal-code"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="country" className="font-body text-sm font-semibold text-foreground">
                        Country
                      </label>
                      <Input
                        id="country"
                        required
                        value={checkoutForm.country}
                        onChange={handleFormChange("country")}
                        autoComplete="country-name"
                      />
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Stripe redirects to a hosted, PCI-compliant payment page where cards, wallets, and additional
                    payment methods are handled securely.
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading || !stripeReady}
                    className="h-12 w-full text-base font-semibold"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirecting to Stripe
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Pay with Stripe
                      </>
                    )}
                  </Button>

                  <div className="grid gap-2 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-3">
                    <p className="inline-flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      Secure encrypted payment
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" />
                      Tracked shipping
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-primary" />
                      Easy exchanges
                    </p>
                  </div>

                  {!stripeReady && (
                    <p className="text-sm text-destructive">
                      Stripe isn&apos;t fully configured. Add `VITE_STRIPE_PUBLISHABLE_KEY` and Stripe price IDs to
                      continue.
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-2xl">Shipping, Returns & FAQs</CardTitle>
                <CardDescription className="font-body text-base">
                  Transparent policies before payment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-0 font-body text-sm text-muted-foreground">
                <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-4 sm:grid-cols-2">
                  <div>
                    <p className="font-semibold text-foreground">Standard shipping</p>
                    <p>
                      {shippingPolicy.standardCost} | {shippingPolicy.standardTimeline}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Express shipping</p>
                    <p>
                      {shippingPolicy.expressCost} | {shippingPolicy.expressTimeline}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="font-semibold text-foreground">Free shipping</p>
                    <p>Orders over {shippingPolicy.freeShippingThreshold} qualify for free standard shipping.</p>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-foreground">Returns and exchanges</p>
                  <p className="mt-1">{returnPolicy}</p>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {faqItems.map((faq) => (
                    <AccordionItem key={faq.id} value={faq.id}>
                      <AccordionTrigger className="text-left font-semibold text-foreground">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent>{faq.answer}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                <p className="text-xs">
                  Want to see customer feedback?{" "}
                  <a href={googleReviewsUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                    Read our Google Reviews
                  </a>
                  .
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-2xl">Order Summary</CardTitle>
              <CardDescription className="font-body text-base">
                {items.length} item{items.length > 1 ? "s" : ""} in your bag
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="max-h-[300px] space-y-3 overflow-auto pr-1">
                {items.map(({ id, product, selection, quantity }) => (
                  <div key={id} className="flex gap-3 rounded-md border border-border bg-background p-3">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-20 w-16 rounded-sm object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-base font-semibold text-foreground">{product.name}</p>
                      <p className="font-body text-sm text-muted-foreground">
                        {formatCad(product.price)} x {quantity}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        Size: {selection.size} | Color: {selection.color}
                      </p>
                    </div>
                    <p className="font-display text-base font-semibold text-foreground">
                      {formatCad(product.price * quantity)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCad(totalPrice)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Shipping</span>
                  <span>Calculated on Stripe</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3 font-display text-lg font-bold text-foreground">
                  <span>Total</span>
                  <span>{formatCad(totalPrice)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Checkout;
