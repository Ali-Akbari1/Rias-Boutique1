import { type ChangeEvent, type FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { useCart } from "@/features/cart/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/ui/accordion";
import { formatCad } from "@/lib/money";
import {
  buildCheckoutItems,
  buildClientIdempotencyKey,
  redirectToCheckout,
  extractApiErrorMessage,
  requestOptionalCartToken,
} from "@/lib/checkout-request";
import { faqItems, getGoogleReviewsUrl, returnPolicy, shippingPolicy } from "@/features/store/data/store-content";

interface CheckoutForm {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface CloverCheckoutResponse {
  checkoutUrl?: string;
  reused?: boolean;
  orderId?: string;
  error?: string;
}

const initialForm: CheckoutForm = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "Canada",
};

const SHIPPING_FLAT_RATE = 30;
const FREE_SHIPPING_THRESHOLD = 400;
const TAX_RATE = 0.05;
const toBoolean = (value: string | undefined) => value?.trim().toLowerCase() === "true";
const isShippingChargesEnabled = () => toBoolean(import.meta.env.VITE_ENABLE_SHIPPING_CHARGES as string | undefined);

const Checkout = () => {
  const { items, totalPrice } = useCart();
  const { toast } = useToast();
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const googleReviewsUrl = getGoogleReviewsUrl();
  const shippingChargesEnabled = isShippingChargesEnabled();

  const subtotalMinor = Math.round(totalPrice * 100);
  const shippingMinor =
    shippingChargesEnabled && subtotalMinor < FREE_SHIPPING_THRESHOLD * 100 ? SHIPPING_FLAT_RATE * 100 : 0;
  const taxMinor = Math.round((subtotalMinor + shippingMinor) * TAX_RATE);
  const totalMinor = subtotalMinor + shippingMinor + taxMinor;
  const subtotal = subtotalMinor / 100;
  const shipping = shippingMinor / 100;
  const tax = taxMinor / 100;
  const total = totalMinor / 100;

  const handleFormChange = (field: keyof CheckoutForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setCheckoutForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleCloverCheckout = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const checkoutItems = buildCheckoutItems(items);
      const idempotencyKey = buildClientIdempotencyKey({
        email: checkoutForm.email,
        postalCode: checkoutForm.postalCode,
        items: checkoutItems,
      });
      const { cartToken, cartTimestamp } = await requestOptionalCartToken(checkoutItems).catch(() => ({
        cartToken: "",
        cartTimestamp: 0,
      }));

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      const response = await fetch("/api/clover-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          customer: checkoutForm,
          items: checkoutItems,
          idempotencyKey,
          cartToken,
          cartTimestamp,
          website: "",
        }),
      }).finally(() => window.clearTimeout(timeout));

      const payload = (await response.json().catch(() => ({}))) as CloverCheckoutResponse;
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(extractApiErrorMessage(payload, "Unable to start Clover checkout right now."));
      }

      redirectToCheckout(payload.checkoutUrl);
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Checkout request timed out. Please check your connection and try again."
          : extractApiErrorMessage(error, "An unexpected error occurred while redirecting to Clover.");
      toast({
        title: "Unable to start checkout",
        description: message,
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
        <div className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
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

      <main className="container mx-auto px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 sm:mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-4xl">Secure Checkout</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:mt-2 sm:text-lg">
            Review your order and continue to Clover for secure payment processing.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="order-2 space-y-4 sm:space-y-6 lg:order-1">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-2xl">Contact & Shipping</CardTitle>
                <CardDescription className="font-body text-base">
                  We use this information to prefill your secure Clover checkout session.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleCloverCheckout} className="space-y-4">
                  <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="fullName" className="font-body text-sm font-semibold text-foreground">
                        Full name
                      </label>
                      <Input
                        id="fullName"
                        required
                        maxLength={120}
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
                        maxLength={160}
                        value={checkoutForm.email}
                        onChange={handleFormChange("email")}
                        autoComplete="email"
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="phone" className="font-body text-sm font-semibold text-foreground">
                        Phone
                      </label>
                      <Input
                        id="phone"
                        type="tel"
                        required
                        maxLength={22}
                        pattern="[0-9()+\\-.\\s]{7,22}"
                        value={checkoutForm.phone}
                        onChange={handleFormChange("phone")}
                        autoComplete="tel"
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="address" className="font-body text-sm font-semibold text-foreground">
                        Address
                      </label>
                      <Input
                        id="address"
                        required
                        maxLength={200}
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
                        maxLength={80}
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
                        maxLength={80}
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
                        maxLength={20}
                        pattern="[A-Za-z0-9\- ]{3,20}"
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
                        maxLength={80}
                        value={checkoutForm.country}
                        onChange={handleFormChange("country")}
                        autoComplete="country-name"
                      />
                    </div>
                  </div>
                  <Input
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="hidden"
                    value=""
                    readOnly
                  />

                  <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Clover redirects to a hosted, PCI-compliant payment page where cards and digital wallets are
                    handled securely.
                  </div>

                  <Button type="submit" disabled={isLoading} className="h-11 w-full text-sm font-semibold sm:h-12 sm:text-base">
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Redirecting to Clover
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Pay with Clover
                      </>
                    )}
                  </Button>

                  <div className="grid gap-2 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-3">
                    <p className="inline-flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      Secure Clover payment
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" />
                      Tracked shipping
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-primary" />
                      Authentic craftsmanship
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You&apos;ll be redirected to Clover to complete your payment.
                  </p>
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
                  </div>
                  <div className="sm:col-span-2">
                    <p className="font-semibold text-foreground">Free shipping</p>
                    <p>Orders over {shippingPolicy.freeShippingThreshold} qualify for free standard shipping.</p>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-foreground"></p>
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

          <Card className="order-1 h-fit lg:order-2 lg:sticky lg:top-6">
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-2xl">Order Summary</CardTitle>
              <CardDescription className="font-body text-base">
                {items.length} item{items.length > 1 ? "s" : ""} in your bag
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="max-h-[300px] space-y-2.5 overflow-auto pr-1 sm:space-y-3">
                {items.map(({ id, product, selection, quantity }) => (
                  <div key={id} className="flex gap-2.5 rounded-md border border-border bg-background p-2.5 sm:gap-3 sm:p-3">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-16 w-14 rounded-sm object-cover sm:h-20 sm:w-16"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-semibold text-foreground sm:text-base">{product.name}</p>
                      <p className="font-body text-xs text-muted-foreground sm:text-sm">
                        {formatCad(product.price)} x {quantity}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        Size: {selection.size} | Color: {selection.color}
                      </p>
                    </div>
                    <p className="font-display text-sm font-semibold text-foreground sm:text-base">
                      {formatCad(product.price * quantity)}
                    </p>
                  </div>
                ))}
              </div>

                <div className="space-y-2 border-t border-border pt-4 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCad(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span>{shipping === 0 ? "Free" : formatCad(shipping)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Tax (5%)</span>
                    <span>{formatCad(tax)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3 font-display text-lg font-bold text-foreground">
                    <span>Total</span>
                    <span>{formatCad(total)}</span>
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
