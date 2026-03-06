import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  getLaunchDiscountExpiryDateLabel,
  isLaunchDiscountActive,
  LAUNCH_DISCOUNT_CODE,
  LAUNCH_DISCOUNT_RATE,
} from "@/lib/launch-discount";
import {
  buildCheckoutItems,
  buildClientIdempotencyKey,
  redirectToCheckout,
  extractApiErrorMessage,
  requestOptionalCartToken,
  requestShippingRates,
  type ShippingRateOption,
} from "@/lib/checkout-request";
import {
  faqItems,
  getGoogleReviewsUrl,
  getStorePickupDetails,
  returnPolicy,
  shippingPolicy,
} from "@/features/store/data/store-content";

type DeliveryMethod = "shipping" | "pickup";

interface CheckoutForm {
  deliveryMethod: DeliveryMethod;
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
  deliveryMethod: "shipping",
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "Canada",
};

const FREE_SHIPPING_THRESHOLD = 400;
const TAX_RATE = 0.05;
const toBoolean = (value: string | undefined) => value?.trim().toLowerCase() === "true";
const isShippingChargesEnabled = () => toBoolean(import.meta.env.VITE_ENABLE_SHIPPING_CHARGES as string | undefined);
const looksLikeEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());
const isShippingAddressComplete = (form: CheckoutForm) =>
  form.deliveryMethod === "shipping" &&
  form.fullName.trim().length >= 2 &&
  looksLikeEmail(form.email) &&
  form.phone.trim().length >= 7 &&
  form.address.trim().length >= 4 &&
  form.city.trim().length >= 2 &&
  form.state.trim().length >= 2 &&
  form.postalCode.trim().length >= 3 &&
  form.country.trim().length >= 2;

const Checkout = () => {
  const { items, totalPrice } = useCart();
  const { toast } = useToast();
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(initialForm);
  const [discountCode, setDiscountCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingRateOption[]>([]);
  const [selectedShippingToken, setSelectedShippingToken] = useState("");
  const [shippingMessage, setShippingMessage] = useState("");
  const [shippingError, setShippingError] = useState("");
  const [isShippingLoading, setIsShippingLoading] = useState(false);
  const googleReviewsUrl = getGoogleReviewsUrl();
  const pickupDetails = getStorePickupDetails();
  const shippingChargesEnabled = isShippingChargesEnabled();
  const launchDiscountActive = isLaunchDiscountActive();
  const launchDiscountEndsLabel = getLaunchDiscountExpiryDateLabel();
  const checkoutControllerRef = useRef<AbortController | null>(null);
  const checkoutTimeoutRef = useRef<number | null>(null);
  const shippingControllerRef = useRef<AbortController | null>(null);
  const shippingTimeoutRef = useRef<number | null>(null);

  const checkoutItems = useMemo(() => buildCheckoutItems(items), [items]);
  const subtotalMinor = Math.round(totalPrice * 100);
  const normalizedDiscountCode = discountCode.trim().toUpperCase();
  const discountMinor =
    launchDiscountActive && normalizedDiscountCode === LAUNCH_DISCOUNT_CODE
      ? Math.round(subtotalMinor * LAUNCH_DISCOUNT_RATE)
      : 0;
  const discountedSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);
  const isPickupInStore = checkoutForm.deliveryMethod === "pickup";
  const selectedShippingOption =
    shippingOptions.find((option) => option.token === selectedShippingToken) || shippingOptions[0] || null;
  const quotedShippingMinor = isPickupInStore ? 0 : selectedShippingOption?.quotedRateMinor || 0;
  const shippingMinor = isPickupInStore ? 0 : selectedShippingOption?.customerRateMinor || 0;
  const freeShippingApplied = !isPickupInStore && quotedShippingMinor > 0 && shippingMinor === 0;
  const taxMinor = Math.round((discountedSubtotalMinor + shippingMinor) * TAX_RATE);
  const totalMinor = discountedSubtotalMinor + shippingMinor + taxMinor;
  const subtotal = subtotalMinor / 100;
  const discount = discountMinor / 100;
  const shipping = shippingMinor / 100;
  const tax = taxMinor / 100;
  const total = totalMinor / 100;
  const shippingAddressReady = isShippingAddressComplete(checkoutForm);
  const canSubmitCheckout =
    !isLoading &&
    (isPickupInStore ||
      (shippingChargesEnabled && shippingAddressReady && Boolean(selectedShippingOption) && !isShippingLoading && !shippingError));
  const freeShippingThresholdNote =
    isPickupInStore
      ? "Pick up in store selected. No shipping fee will be charged."
      : freeShippingApplied && selectedShippingOption
      ? `Free shipping on orders over ${formatCad(FREE_SHIPPING_THRESHOLD)}. Applied to ${selectedShippingOption.label}.`
      : selectedShippingOption
      ? `${selectedShippingOption.label}${selectedShippingOption.deliveryDays ? ` estimated ${selectedShippingOption.deliveryDays} business day${selectedShippingOption.deliveryDays === 1 ? "" : "s"}.` : "."}`
      : `Free shipping on orders over ${formatCad(FREE_SHIPPING_THRESHOLD)}.`;

  const handleFormChange = (field: keyof CheckoutForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setCheckoutForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const clearPendingCheckoutRequest = () => {
    if (checkoutTimeoutRef.current !== null) {
      window.clearTimeout(checkoutTimeoutRef.current);
      checkoutTimeoutRef.current = null;
    }

    if (checkoutControllerRef.current) {
      checkoutControllerRef.current.abort();
      checkoutControllerRef.current = null;
    }
  };

  const clearPendingShippingRequest = () => {
    if (shippingTimeoutRef.current !== null) {
      window.clearTimeout(shippingTimeoutRef.current);
      shippingTimeoutRef.current = null;
    }

    if (shippingControllerRef.current) {
      shippingControllerRef.current.abort();
      shippingControllerRef.current = null;
    }
  };

  useEffect(() => {
    const handlePageShow = () => {
      setIsLoading(false);
      setIsShippingLoading(false);
    };
    const handlePageHide = () => {
      clearPendingCheckoutRequest();
      clearPendingShippingRequest();
      setIsLoading(false);
      setIsShippingLoading(false);
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      clearPendingCheckoutRequest();
      clearPendingShippingRequest();
    };
  }, []);

  useEffect(() => {
    if (items.length === 0 || isPickupInStore) {
      clearPendingShippingRequest();
      setShippingOptions([]);
      setSelectedShippingToken("");
      setShippingMessage("");
      setShippingError("");
      setIsShippingLoading(false);
      return;
    }

    if (!shippingChargesEnabled) {
      clearPendingShippingRequest();
      setShippingOptions([]);
      setSelectedShippingToken("");
      setShippingMessage("");
      setShippingError("Shipping is not available right now. Please select pickup.");
      setIsShippingLoading(false);
      return;
    }

    if (!shippingAddressReady) {
      clearPendingShippingRequest();
      setShippingOptions([]);
      setSelectedShippingToken("");
      setShippingMessage("Enter your shipping address to load live carrier rates.");
      setShippingError("");
      setIsShippingLoading(false);
      return;
    }

    clearPendingShippingRequest();
    setIsShippingLoading(true);
    setShippingError("");

    const controller = new AbortController();
    shippingControllerRef.current = controller;
    const timeout = window.setTimeout(() => {
      void requestShippingRates({
        customer: checkoutForm,
        items: checkoutItems,
        signal: controller.signal,
      })
        .then((payload) => {
          const nextOptions = Array.isArray(payload.options) ? payload.options : [];
          setShippingOptions(nextOptions);
          setSelectedShippingToken((current) =>
            nextOptions.some((option) => option.token === current)
              ? current
              : payload.selectedOptionToken || nextOptions[0]?.token || "",
          );
          setShippingMessage(payload.message || "");
          setShippingError(nextOptions.length === 0 ? "No shipping rates are available for this address yet." : "");
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          setShippingOptions([]);
          setSelectedShippingToken("");
          setShippingMessage("");
          setShippingError(extractApiErrorMessage(error, "Unable to calculate shipping right now."));
        })
        .finally(() => {
          if (shippingControllerRef.current === controller) {
            shippingControllerRef.current = null;
          }
          if (shippingTimeoutRef.current !== null) {
            window.clearTimeout(shippingTimeoutRef.current);
            shippingTimeoutRef.current = null;
          }
          setIsShippingLoading(false);
        });
    }, 450);

    shippingTimeoutRef.current = timeout;

    return () => {
      controller.abort();
      if (shippingTimeoutRef.current !== null) {
        window.clearTimeout(shippingTimeoutRef.current);
        shippingTimeoutRef.current = null;
      }
      if (shippingControllerRef.current === controller) {
        shippingControllerRef.current = null;
      }
    };
  }, [checkoutForm, checkoutItems, isPickupInStore, items.length, shippingAddressReady, shippingChargesEnabled]);

  const handleCloverCheckout = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    if (!isPickupInStore) {
      if (!shippingAddressReady) {
        toast({
          title: "Shipping address required",
          description: "Enter your shipping address to load live carrier rates before checkout.",
          variant: "destructive",
        });
        return;
      }

      if (isShippingLoading) {
        toast({
          title: "Shipping still loading",
          description: "Wait for live shipping rates to finish loading before continuing.",
          variant: "destructive",
        });
        return;
      }

      if (shippingError || !selectedShippingOption) {
        toast({
          title: "Shipping option required",
          description: shippingError || "Select a shipping option before continuing to payment.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsLoading(true);

    try {
      clearPendingCheckoutRequest();
      const idempotencyKey = buildClientIdempotencyKey({
        email: checkoutForm.email,
        postalCode: checkoutForm.deliveryMethod === "pickup" ? "pickup" : checkoutForm.postalCode,
        discountCode: normalizedDiscountCode,
        items: checkoutItems,
        shippingContext:
          checkoutForm.deliveryMethod === "pickup"
            ? "pickup"
            : [
                selectedShippingToken,
                checkoutForm.address,
                checkoutForm.city,
                checkoutForm.state,
                checkoutForm.postalCode,
                checkoutForm.country,
              ].join("|"),
      });
      const { cartToken, cartTimestamp } = await requestOptionalCartToken(checkoutItems).catch(() => ({
        cartToken: "",
        cartTimestamp: 0,
      }));

      const controller = new AbortController();
      checkoutControllerRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      checkoutTimeoutRef.current = timeout;
      const response = await fetch("/api/clover-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          customer: checkoutForm,
          items: checkoutItems,
          discountCode: normalizedDiscountCode,
          shippingQuote: selectedShippingToken ? { token: selectedShippingToken } : undefined,
          idempotencyKey,
          cartToken,
          cartTimestamp,
          website: "",
        }),
      }).finally(() => {
        if (checkoutTimeoutRef.current !== null) {
          window.clearTimeout(checkoutTimeoutRef.current);
          checkoutTimeoutRef.current = null;
        }
        checkoutControllerRef.current = null;
      });

      const payload = (await response.json().catch(() => ({}))) as CloverCheckoutResponse;
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(extractApiErrorMessage(payload, "Unable to start Clover checkout right now."));
      }

      redirectToCheckout(payload.checkoutUrl);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && document.visibilityState === "hidden") {
        return;
      }

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
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
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
          <div className="order-2 min-w-0 space-y-4 sm:space-y-6 lg:order-1">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-2xl">Contact & Fulfillment</CardTitle>
                <CardDescription className="font-body text-base">
                  We use this information to prefill your secure Clover checkout session.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <form onSubmit={handleCloverCheckout} className="space-y-4">
                  <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <p className="font-body text-sm font-semibold text-foreground">Delivery method</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCheckoutForm((current) => ({ ...current, deliveryMethod: "shipping" }))}
                          className={`min-w-0 rounded-sm border px-3 py-2 text-sm font-medium transition ${
                            checkoutForm.deliveryMethod === "shipping"
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:bg-secondary"
                          }`}
                          aria-pressed={checkoutForm.deliveryMethod === "shipping"}
                        >
                          Shipping
                        </button>
                        <button
                          type="button"
                          onClick={() => setCheckoutForm((current) => ({ ...current, deliveryMethod: "pickup" }))}
                          className={`min-w-0 rounded-sm border px-3 py-2 text-sm font-medium transition ${
                            checkoutForm.deliveryMethod === "pickup"
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:bg-secondary"
                          }`}
                          aria-pressed={checkoutForm.deliveryMethod === "pickup"}
                        >
                          Pick up in store
                        </button>
                      </div>
                    </div>

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
                        minLength={7}
                        maxLength={22}
                        value={checkoutForm.phone}
                        onChange={handleFormChange("phone")}
                        autoComplete="tel"
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="discountCode" className="font-body text-sm font-semibold text-foreground">
                        Discount code
                      </label>
                      <Input
                        id="discountCode"
                        maxLength={40}
                        value={discountCode}
                        onChange={(event) => setDiscountCode(event.target.value)}
                        placeholder="Enter discount code"
                        autoComplete="off"
                      />
                      {discountCode.trim() ? (
                        <p className="text-xs text-muted-foreground">
                          {normalizedDiscountCode !== LAUNCH_DISCOUNT_CODE
                            ? `Invalid code.`
                            : !launchDiscountActive
                            ? `${LAUNCH_DISCOUNT_CODE} expired on ${launchDiscountEndsLabel}.`
                            : `${LAUNCH_DISCOUNT_CODE} applied (10% off).`}
                        </p>
                      ) : launchDiscountActive ? (
                        <p className="text-xs text-muted-foreground">
                          Have a launch discount code? Enter it above to get 10% off. Offer ends {launchDiscountEndsLabel}.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Promotional launch discount has ended.
                        </p>
                      )}
                    </div>

                    {isPickupInStore ? (
                      <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground sm:col-span-2">
                        <p className="mt-2">
                          <span className="font-semibold text-foreground">Pickup address:</span>{" "}
                          <a
                            href={pickupDetails.mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-foreground"
                          >
                            {pickupDetails.address}
                          </a>
                        </p>
                        <p className="mt-1">
                          <span className="font-semibold text-foreground">Phone:</span>{" "}
                          <a href={`tel:${pickupDetails.phoneHref}`} className="underline hover:text-foreground">
                            {pickupDetails.phoneDisplay}
                          </a>
                        </p>
                        <div className="mt-2">
                          <p className="font-semibold text-foreground">Pickup hours:</p>
                          <ul className="mt-1 space-y-1">
                            {pickupDetails.hours.map((hoursEntry) => (
                              <li key={hoursEntry}>{hoursEntry}</li>
                            ))}
                          </ul>
                        </div>
                        <p className="mt-2 text-xs">{pickupDetails.note}</p>
                      </div>
                    ) : (
                      <>
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
                            pattern={"[A-Za-z0-9\\- ]{3,20}"}
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

                        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3 sm:col-span-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-body text-sm font-semibold text-foreground">Shipping method</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Live carrier rates appear here after your shipping address is complete.
                              </p>
                            </div>
                            {isShippingLoading ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" /> : null}
                          </div>

                          {!shippingAddressReady ? (
                            <p className="text-sm text-muted-foreground">Enter your shipping address to view live rates.</p>
                          ) : shippingError ? (
                            <p className="text-sm text-destructive">{shippingError}</p>
                          ) : shippingOptions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {shippingMessage || "Rates will appear here once available."}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {shippingOptions.map((option) => {
                                const isSelected = option.token === selectedShippingToken;
                                return (
                                  <button
                                    key={option.token}
                                    type="button"
                                    onClick={() => setSelectedShippingToken(option.token)}
                                    className={`flex w-full items-center justify-between rounded-sm border px-3 py-3 text-left transition ${
                                      isSelected
                                        ? "border-primary bg-background shadow-sm"
                                        : "border-border bg-background hover:bg-secondary/60"
                                    }`}
                                    aria-pressed={isSelected}
                                  >
                                    <div className="min-w-0">
                                      <p className="break-words font-medium text-foreground">{option.label}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {option.deliveryDays
                                          ? `Estimated ${option.deliveryDays} business day${option.deliveryDays === 1 ? "" : "s"}`
                                          : "Delivery estimate provided by carrier at label creation"}
                                      </p>
                                    </div>
                                    <div className="pl-3 text-right">
                                      <p className="font-semibold text-foreground">
                                        {option.customerRateMinor === 0 ? "Free" : formatCad(option.customerRateMinor / 100)}
                                      </p>
                                      {option.customerRateMinor === 0 && option.quotedRateMinor > 0 ? (
                                        <p className="mt-1 text-[11px] text-muted-foreground">Applied at checkout</p>
                                      ) : null}
                                    </div>
                                  </button>
                                );
                              })}
                              {shippingMessage ? <p className="text-xs text-muted-foreground">{shippingMessage}</p> : null}
                            </div>
                          )}
                        </div>
                      </>
                    )}
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

                  <Button type="submit" disabled={!canSubmitCheckout} className="h-11 w-full text-sm font-semibold sm:h-12 sm:text-base">
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
                    <p className="font-semibold text-foreground">Rate source</p>
                    <p>Live carrier pricing is calculated in checkout based on address and parcel estimate.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="font-semibold text-foreground">Free shipping</p>
                    <p>Orders over {shippingPolicy.freeShippingThreshold} qualify for free standard shipping.</p>
                  </div>
                </div>

                <div>
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

          <Card className="order-1 h-fit min-w-0 lg:order-2 lg:sticky lg:top-6">
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-2xl">Order Summary</CardTitle>
              <CardDescription className="font-body text-base">
                {items.length} item{items.length > 1 ? "s" : ""} in your bag
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="max-h-[300px] space-y-2.5 overflow-auto pr-1 sm:space-y-3">
                {items.map(({ id, product, selection, quantity }) => (
                  <div key={id} className="flex min-w-0 gap-2.5 rounded-md border border-border bg-background p-2.5 sm:gap-3 sm:p-3">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-16 w-14 rounded-sm object-cover sm:h-20 sm:w-16"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-display text-sm font-semibold text-foreground sm:text-base">{product.name}</p>
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
                  {discountMinor > 0 ? (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Discount ({LAUNCH_DISCOUNT_CODE})</span>
                      <span>-{formatCad(discount)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{isPickupInStore ? "Pickup" : "Shipping"}</span>
                    <span>
                      {isPickupInStore
                        ? "In store"
                        : isShippingLoading
                        ? "Calculating"
                        : selectedShippingOption
                        ? shipping === 0
                          ? "Free"
                          : formatCad(shipping)
                        : "-"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{freeShippingThresholdNote}</p>
                  {!isPickupInStore && selectedShippingOption ? (
                    <p className="text-xs text-muted-foreground">
                      Selected rate: {selectedShippingOption.label}
                      {selectedShippingOption.deliveryDays
                        ? ` (${selectedShippingOption.deliveryDays} business day${selectedShippingOption.deliveryDays === 1 ? "" : "s"})`
                        : ""}
                    </p>
                  ) : null}
                  {!isPickupInStore && shippingError ? (
                    <p className="text-xs text-destructive">{shippingError}</p>
                  ) : null}
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
