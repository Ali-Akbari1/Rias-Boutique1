import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Lock, RotateCcw, Search, ShieldCheck, Truck } from "lucide-react";
import { useCart } from "@/features/cart/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import { track } from "@vercel/analytics/react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/ui/accordion";
import { getClientCommerceConfig } from "@/lib/commerce-config";
import { useCurrency } from "@/features/currency/context/CurrencyContext";
import { buildCheckoutPricing, calculateLaunchDiscountMinor } from "@/shared/config/commerce";
import {
  getLaunchDiscountExpiryDateLabel,
  isLaunchDiscountActive,
  LAUNCH_DISCOUNT_CODE,
} from "@/lib/launch-discount";
import {
  buildCheckoutItems,
  buildClientIdempotencyKey,
  redirectToCheckout,
  requestAddressAutocomplete,
  requestAddressAutocompleteSelection,
  requestAddressVerification,
  requestCloverCheckout,
  extractApiErrorMessage,
  requestOptionalCartToken,
  requestShippingRates,
  type AddressAutocompleteSuggestion,
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
type AddressVerificationStatus = "idle" | "verifying" | "verified" | "invalid" | "skipped";

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

const initialForm: CheckoutForm = {
  deliveryMethod: "shipping",
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

const clientCommerceConfig = getClientCommerceConfig();
const looksLikeEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());
const isAddressFieldsComplete = (form: CheckoutForm) =>
  form.deliveryMethod === "shipping" &&
  form.address.trim().length >= 4 &&
  form.city.trim().length >= 2 &&
  form.state.trim().length >= 2 &&
  form.postalCode.trim().length >= 3 &&
  form.country.trim().length >= 2;
const isShippingAddressComplete = (form: CheckoutForm) =>
  isAddressFieldsComplete(form) &&
  form.fullName.trim().length >= 2 &&
  looksLikeEmail(form.email) &&
  form.phone.trim().length >= 7;
const buildAddressFingerprint = (form: CheckoutForm) =>
  [
    form.address,
    form.city,
    form.state,
    form.postalCode,
    form.country,
  ]
    .map((value) => value.trim().toLowerCase())
    .join("|");

const createAutocompleteSessionToken = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `mapbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const Checkout = () => {
  const { items, totalPrice } = useCart();
  const { toast } = useToast();
  const { formatPrice, isUsd } = useCurrency();
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(initialForm);
  const [discountCode, setDiscountCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingRateOption[]>([]);
  const [selectedShippingToken, setSelectedShippingToken] = useState("");
  const [shippingMessage, setShippingMessage] = useState("");
  const [shippingError, setShippingError] = useState("");
  const [isShippingLoading, setIsShippingLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressAutocompleteSuggestion[]>([]);
  const [isAddressSuggestionsOpen, setIsAddressSuggestionsOpen] = useState(false);
  const [isAddressAutocompleteLoading, setIsAddressAutocompleteLoading] = useState(false);
  const [addressAutocompleteAvailable, setAddressAutocompleteAvailable] = useState(true);
  const [addressVerificationStatus, setAddressVerificationStatus] = useState<AddressVerificationStatus>("idle");
  const [addressVerificationMessage, setAddressVerificationMessage] = useState("");
  const [addressVerificationError, setAddressVerificationError] = useState("");
  const [verifiedAddressFingerprint, setVerifiedAddressFingerprint] = useState("");
  const [lastVerifiedAddressFingerprint, setLastVerifiedAddressFingerprint] = useState("");
  const googleReviewsUrl = getGoogleReviewsUrl();
  const pickupDetails = getStorePickupDetails();
  const shippingChargesEnabled = clientCommerceConfig.shippingChargesEnabled;
  const launchDiscountActive = isLaunchDiscountActive();
  const launchDiscountEndsLabel = getLaunchDiscountExpiryDateLabel();
  const checkoutControllerRef = useRef<AbortController | null>(null);
  const checkoutTimeoutRef = useRef<number | null>(null);
  const shippingControllerRef = useRef<AbortController | null>(null);
  const shippingTimeoutRef = useRef<number | null>(null);
  const addressAutocompleteControllerRef = useRef<AbortController | null>(null);
  const addressAutocompleteTimeoutRef = useRef<number | null>(null);
  const addressAutocompleteSessionTokenRef = useRef("");
  const addressVerificationControllerRef = useRef<AbortController | null>(null);
  const addressVerificationTimeoutRef = useRef<number | null>(null);
  const addressBlurTimeoutRef = useRef<number | null>(null);

  const checkoutItems = useMemo(() => buildCheckoutItems(items), [items]);
  const subtotalMinor = Math.round(totalPrice * 100);
  const normalizedDiscountCode = discountCode.trim().toUpperCase();
  const effectiveDiscountCode = launchDiscountActive ? normalizedDiscountCode : "";
  const discountMinor = calculateLaunchDiscountMinor({
    subtotalMinor,
    submittedCode: effectiveDiscountCode,
    launchDiscountCode: clientCommerceConfig.launchDiscountCode,
    launchDiscountRate: clientCommerceConfig.launchDiscountRate,
    launchDiscountActive,
  });
  const isPickupInStore = checkoutForm.deliveryMethod === "pickup";
  const selectedShippingOption =
    shippingOptions.find((option) => option.token === selectedShippingToken) || shippingOptions[0] || null;
  const quotedShippingMinor = isPickupInStore ? 0 : selectedShippingOption?.quotedRateMinor || 0;
  const shippingMinor = isPickupInStore ? 0 : selectedShippingOption?.customerRateMinor || 0;
  const freeShippingApplied = !isPickupInStore && quotedShippingMinor > 0 && shippingMinor === 0;
  const pricing = buildCheckoutPricing({
    subtotalMinor,
    discountMinor,
    shippingMinor,
    taxRate: clientCommerceConfig.checkoutTaxRate,
  });
  const taxMinor = pricing.taxMinor;
  const totalMinor = pricing.totalMinor;
  const subtotal = subtotalMinor / 100;
  const discount = discountMinor / 100;
  const shipping = shippingMinor / 100;
  const tax = taxMinor / 100;
  const total = totalMinor / 100;
  const addressFieldsReady = isAddressFieldsComplete(checkoutForm);
  const shippingAddressReady = isShippingAddressComplete(checkoutForm);
  const currentAddressFingerprint = useMemo(() => buildAddressFingerprint(checkoutForm), [checkoutForm]);
  const isAddressVerified =
    !isPickupInStore &&
    addressVerificationStatus === "verified" &&
    verifiedAddressFingerprint === currentAddressFingerprint;
  const canSubmitCheckout =
    !isLoading &&
    (isPickupInStore ||
      (shippingChargesEnabled &&
        shippingAddressReady &&
        isAddressVerified &&
        Boolean(selectedShippingOption) &&
        !isShippingLoading &&
        !shippingError));
  const freeShippingThresholdNote =
    isPickupInStore
      ? "Pick up in store selected. No shipping fee will be charged."
      : freeShippingApplied && selectedShippingOption
      ? `Free shipping on orders over ${formatPrice(clientCommerceConfig.freeShippingThresholdMinor / 100)}. Applied to ${selectedShippingOption.label}.`
      : selectedShippingOption
      ? `${selectedShippingOption.label}${selectedShippingOption.deliveryDays ? ` estimated ${selectedShippingOption.deliveryDays} business day${selectedShippingOption.deliveryDays === 1 ? "" : "s"}.` : "."} Orders under ${formatPrice(clientCommerceConfig.freeShippingThresholdMinor / 100)} are charged ${formatPrice(clientCommerceConfig.flatShippingRateMinor / 100)} shipping.`
      : `Orders under ${formatPrice(clientCommerceConfig.freeShippingThresholdMinor / 100)} are charged ${formatPrice(clientCommerceConfig.flatShippingRateMinor / 100)} shipping.`;

  const handleFormChange = (field: keyof CheckoutForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setCheckoutForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleAddressInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setCheckoutForm((current) => ({ ...current, address: nextValue }));
    if (!nextValue.trim()) {
      addressAutocompleteSessionTokenRef.current = "";
    }
    setIsAddressSuggestionsOpen(true);
  };

  const applySuggestedAddressSelection = ({
    address,
    city,
    state,
    postalCode,
    country,
  }: Pick<CheckoutForm, "address" | "city" | "state" | "postalCode" | "country">) => {
    clearPendingAddressAutocompleteRequest();
    clearAddressBlurTimeout();
    setCheckoutForm((current) => ({
      ...current,
      address,
      city,
      state,
      postalCode,
      country,
    }));
    setAddressSuggestions([]);
    setIsAddressSuggestionsOpen(false);
    setAddressVerificationStatus("idle");
    setAddressVerificationMessage("");
    setAddressVerificationError("");
    setVerifiedAddressFingerprint("");
    setLastVerifiedAddressFingerprint("");
  };

  const applySuggestedAddress = async (suggestion: AddressAutocompleteSuggestion) => {
    clearPendingAddressAutocompleteRequest();
    clearAddressBlurTimeout();
    setIsAddressAutocompleteLoading(true);

    const controller = new AbortController();
    addressAutocompleteControllerRef.current = controller;
    const sessionToken = addressAutocompleteSessionTokenRef.current || createAutocompleteSessionToken();
    addressAutocompleteSessionTokenRef.current = sessionToken;

    try {
      const payload = await requestAddressAutocompleteSelection({
        mapboxId: suggestion.id,
        country: checkoutForm.country,
        sessionToken,
        signal: controller.signal,
      });
      const resolvedAddress = payload.address || suggestion;
      setAddressAutocompleteAvailable(payload.configured);
      applySuggestedAddressSelection({
        address: resolvedAddress.address || suggestion.address,
        city: resolvedAddress.city || suggestion.city,
        state: resolvedAddress.state || suggestion.state,
        postalCode: resolvedAddress.postalCode || suggestion.postalCode,
        country: resolvedAddress.country || suggestion.country,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setAddressAutocompleteAvailable(true);
      applySuggestedAddressSelection(suggestion);
    } finally {
      if (addressAutocompleteControllerRef.current === controller) {
        addressAutocompleteControllerRef.current = null;
      }
      setIsAddressAutocompleteLoading(false);
      addressAutocompleteSessionTokenRef.current = "";
    }
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

  const clearPendingAddressAutocompleteRequest = () => {
    if (addressAutocompleteTimeoutRef.current !== null) {
      window.clearTimeout(addressAutocompleteTimeoutRef.current);
      addressAutocompleteTimeoutRef.current = null;
    }

    if (addressAutocompleteControllerRef.current) {
      addressAutocompleteControllerRef.current.abort();
      addressAutocompleteControllerRef.current = null;
    }
  };

  const clearPendingAddressVerificationRequest = () => {
    if (addressVerificationTimeoutRef.current !== null) {
      window.clearTimeout(addressVerificationTimeoutRef.current);
      addressVerificationTimeoutRef.current = null;
    }

    if (addressVerificationControllerRef.current) {
      addressVerificationControllerRef.current.abort();
      addressVerificationControllerRef.current = null;
    }
  };

  const clearAddressBlurTimeout = () => {
    if (addressBlurTimeoutRef.current !== null) {
      window.clearTimeout(addressBlurTimeoutRef.current);
      addressBlurTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!launchDiscountActive && discountCode) {
      setDiscountCode("");
    }
  }, [launchDiscountActive, discountCode]);

  useEffect(() => {
    const handlePageShow = () => {
      setIsLoading(false);
      setIsShippingLoading(false);
    };
    const handlePageHide = () => {
      clearPendingCheckoutRequest();
      clearPendingShippingRequest();
      clearPendingAddressAutocompleteRequest();
      addressAutocompleteSessionTokenRef.current = "";
      clearPendingAddressVerificationRequest();
      clearAddressBlurTimeout();
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
      clearPendingAddressAutocompleteRequest();
      addressAutocompleteSessionTokenRef.current = "";
      clearPendingAddressVerificationRequest();
      clearAddressBlurTimeout();
    };
  }, []);

  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      return undefined;
    }

    const previousContent = viewport.getAttribute("content") || "";
    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );

    return () => {
      viewport.setAttribute("content", previousContent || "width=device-width, initial-scale=1.0");
    };
  }, []);

  useEffect(() => {
    if (isPickupInStore || !addressAutocompleteAvailable) {
      clearPendingAddressAutocompleteRequest();
      setAddressSuggestions([]);
      setIsAddressSuggestionsOpen(false);
      setIsAddressAutocompleteLoading(false);
      return;
    }

    const query = checkoutForm.address.trim();
    if (query.length < 3) {
      clearPendingAddressAutocompleteRequest();
      setAddressSuggestions([]);
      setIsAddressSuggestionsOpen(false);
      setIsAddressAutocompleteLoading(false);
      return;
    }

    clearPendingAddressAutocompleteRequest();
    setIsAddressAutocompleteLoading(true);

    const controller = new AbortController();
    addressAutocompleteControllerRef.current = controller;
    const sessionToken = addressAutocompleteSessionTokenRef.current || createAutocompleteSessionToken();
    addressAutocompleteSessionTokenRef.current = sessionToken;
    const timeout = window.setTimeout(() => {
      void requestAddressAutocomplete({
        query,
        country: checkoutForm.country,
        sessionToken,
        signal: controller.signal,
      })
        .then((payload) => {
          if (payload.sessionToken) {
            addressAutocompleteSessionTokenRef.current = payload.sessionToken;
          }
          setAddressAutocompleteAvailable(payload.configured);
          setAddressSuggestions(payload.suggestions);
          setIsAddressSuggestionsOpen(payload.suggestions.length > 0);
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          setAddressSuggestions([]);
          setIsAddressSuggestionsOpen(false);
          if (error instanceof Error && error.message.includes("not configured")) {
            setAddressAutocompleteAvailable(false);
          }
        })
        .finally(() => {
          if (addressAutocompleteControllerRef.current === controller) {
            addressAutocompleteControllerRef.current = null;
          }
          if (addressAutocompleteTimeoutRef.current !== null) {
            window.clearTimeout(addressAutocompleteTimeoutRef.current);
            addressAutocompleteTimeoutRef.current = null;
          }
          setIsAddressAutocompleteLoading(false);
        });
    }, 180);

    addressAutocompleteTimeoutRef.current = timeout;

    return () => {
      controller.abort();
      if (addressAutocompleteTimeoutRef.current !== null) {
        window.clearTimeout(addressAutocompleteTimeoutRef.current);
        addressAutocompleteTimeoutRef.current = null;
      }
      if (addressAutocompleteControllerRef.current === controller) {
        addressAutocompleteControllerRef.current = null;
      }
    };
  }, [addressAutocompleteAvailable, checkoutForm.address, checkoutForm.country, isPickupInStore]);

  useEffect(() => {
    if (isPickupInStore) {
      clearPendingAddressVerificationRequest();
      setAddressVerificationStatus("skipped");
      setAddressVerificationMessage("");
      setAddressVerificationError("");
      setVerifiedAddressFingerprint("");
      setLastVerifiedAddressFingerprint("");
      return;
    }

    if (!addressFieldsReady) {
      clearPendingAddressVerificationRequest();
      setAddressVerificationStatus("idle");
      setAddressVerificationMessage("");
      setAddressVerificationError("");
      setVerifiedAddressFingerprint("");
      setLastVerifiedAddressFingerprint("");
      return;
    }

    if (
      lastVerifiedAddressFingerprint === currentAddressFingerprint &&
      (addressVerificationStatus === "verified" || addressVerificationStatus === "invalid")
    ) {
      return;
    }

    clearPendingAddressVerificationRequest();
    setAddressVerificationStatus("verifying");
    setAddressVerificationError("");
    setAddressVerificationMessage("Confirming your shipping address format.");

    const controller = new AbortController();
    addressVerificationControllerRef.current = controller;
    const timeout = window.setTimeout(() => {
      void requestAddressVerification({
        customer: checkoutForm,
        signal: controller.signal,
      })
        .then((payload) => {
          const normalizedAddress = payload.normalizedAddress;
          const nextForm = normalizedAddress
            ? {
                ...checkoutForm,
                address: normalizedAddress.address,
                city: normalizedAddress.city,
                state: normalizedAddress.state,
                postalCode: normalizedAddress.postalCode,
                country: normalizedAddress.country,
              }
            : checkoutForm;
          const nextFingerprint = buildAddressFingerprint(nextForm);

          setCheckoutForm((current) => {
            if (
              current.address === nextForm.address &&
              current.city === nextForm.city &&
              current.state === nextForm.state &&
              current.postalCode === nextForm.postalCode &&
              current.country === nextForm.country
            ) {
              return current;
            }

            return {
              ...current,
              address: nextForm.address,
              city: nextForm.city,
              state: nextForm.state,
              postalCode: nextForm.postalCode,
              country: nextForm.country,
            };
          });
          setVerifiedAddressFingerprint(nextFingerprint);
          setLastVerifiedAddressFingerprint(nextFingerprint);
          setAddressVerificationStatus("verified");
          setAddressVerificationMessage(payload.message || "Address confirmed. Shipping is ready to load.");
          setAddressVerificationError("");
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          setVerifiedAddressFingerprint("");
          setLastVerifiedAddressFingerprint(currentAddressFingerprint);
          setAddressVerificationStatus("invalid");
          setAddressVerificationMessage("");
          setAddressVerificationError(extractApiErrorMessage(error, "Unable to verify this shipping address."));
        })
        .finally(() => {
          if (addressVerificationControllerRef.current === controller) {
            addressVerificationControllerRef.current = null;
          }
          if (addressVerificationTimeoutRef.current !== null) {
            window.clearTimeout(addressVerificationTimeoutRef.current);
            addressVerificationTimeoutRef.current = null;
          }
        });
    }, 350);

    addressVerificationTimeoutRef.current = timeout;

    return () => {
      controller.abort();
      if (addressVerificationTimeoutRef.current !== null) {
        window.clearTimeout(addressVerificationTimeoutRef.current);
        addressVerificationTimeoutRef.current = null;
      }
      if (addressVerificationControllerRef.current === controller) {
        addressVerificationControllerRef.current = null;
      }
    };
  }, [
    addressFieldsReady,
    addressVerificationStatus,
    checkoutForm,
    currentAddressFingerprint,
    isPickupInStore,
    lastVerifiedAddressFingerprint,
  ]);

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

    if (!addressFieldsReady) {
      clearPendingShippingRequest();
      setShippingOptions([]);
      setSelectedShippingToken("");
      setShippingMessage("Complete your shipping address to load shipping.");
      setShippingError("");
      setIsShippingLoading(false);
      return;
    }

    if (addressVerificationStatus === "verifying") {
      clearPendingShippingRequest();
      setShippingOptions([]);
      setSelectedShippingToken("");
      setShippingMessage("Confirming your shipping address format before loading shipping.");
      setShippingError("");
      setIsShippingLoading(false);
      return;
    }

    if (!isAddressVerified) {
      clearPendingShippingRequest();
      setShippingOptions([]);
      setSelectedShippingToken("");
      setShippingMessage(addressVerificationMessage || "Confirm your shipping address before loading shipping.");
      setShippingError(addressVerificationStatus === "invalid" ? addressVerificationError : "");
      setIsShippingLoading(false);
      return;
    }

    if (!shippingAddressReady) {
      clearPendingShippingRequest();
      setShippingOptions([]);
      setSelectedShippingToken("");
      setShippingMessage("Enter your contact details to load shipping for this address.");
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
  }, [
    addressFieldsReady,
    addressVerificationError,
    addressVerificationMessage,
    addressVerificationStatus,
    checkoutForm,
    checkoutItems,
    isAddressVerified,
    isPickupInStore,
    items.length,
    shippingAddressReady,
    shippingChargesEnabled,
  ]);

  const handleCloverCheckout = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    if (!isPickupInStore) {
      if (!addressFieldsReady) {
        toast({
          title: "Shipping address required",
          description: "Enter your shipping address so we can confirm it before loading carrier rates.",
          variant: "destructive",
        });
        return;
      }

      if (addressVerificationStatus === "verifying") {
        toast({
          title: "Address still confirming",
          description: "Wait for address confirmation to finish before continuing to payment.",
          variant: "destructive",
        });
        return;
      }

      if (!isAddressVerified) {
        toast({
          title: "Address confirmation required",
          description: addressVerificationError || "Confirm your shipping address before continuing to payment.",
          variant: "destructive",
        });
        return;
      }

      if (!shippingAddressReady) {
        toast({
          title: "Contact details required",
          description: "Enter your full name, email, and phone number to load shipping before checkout.",
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
    track("Checkout Started", {
      items: checkoutItems.length,
      itemQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      total,
      shipping,
      discount,
      deliveryMethod: checkoutForm.deliveryMethod,
      hasDiscount: discountMinor > 0,
    });

    try {
      clearPendingCheckoutRequest();
      const idempotencyKey = buildClientIdempotencyKey({
        email: checkoutForm.email,
        postalCode: checkoutForm.deliveryMethod === "pickup" ? "pickup" : checkoutForm.postalCode,
        discountCode: effectiveDiscountCode,
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
      const payload = await requestCloverCheckout({
        signal: controller.signal,
        payload: {
          customer: checkoutForm,
          items: checkoutItems,
          discountCode: effectiveDiscountCode,
          shippingQuote: selectedShippingToken ? { token: selectedShippingToken } : undefined,
          idempotencyKey,
          cartToken,
          cartTimestamp,
          website: "",
        },
      }).finally(() => {
        if (checkoutTimeoutRef.current !== null) {
          window.clearTimeout(checkoutTimeoutRef.current);
          checkoutTimeoutRef.current = null;
        }
        checkoutControllerRef.current = null;
      });

      if (!payload.checkoutUrl) {
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

                      {launchDiscountActive ? (
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
                                : `${LAUNCH_DISCOUNT_CODE} applied (10% off).`}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Have a launch discount code? Enter it above to get 10% off. Offer ends {launchDiscountEndsLabel}.
                            </p>
                          )}
                        </div>
                      ) : null}

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
                          <div className="relative">
                            <Input
                              id="address"
                              required
                              maxLength={200}
                              value={checkoutForm.address}
                              onChange={handleAddressInputChange}
                              onFocus={() => {
                                clearAddressBlurTimeout();
                                if (addressSuggestions.length > 0) {
                                  setIsAddressSuggestionsOpen(true);
                                }
                              }}
                              onBlur={() => {
                                clearAddressBlurTimeout();
                                addressBlurTimeoutRef.current = window.setTimeout(() => {
                                  setIsAddressSuggestionsOpen(false);
                                }, 120);
                              }}
                              autoComplete="street-address"
                              placeholder="Start typing your street address"
                              className="pr-10"
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                              {isAddressAutocompleteLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                            </div>
                            {isAddressSuggestionsOpen && addressSuggestions.length > 0 ? (
                              <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-auto rounded-md border border-border bg-background shadow-lg">
                                {addressSuggestions.map((suggestion) => (
                                  <button
                                    key={suggestion.id}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      void applySuggestedAddress(suggestion);
                                    }}
                                    className="flex w-full flex-col items-start gap-1 px-3 py-3 text-left transition hover:bg-secondary/60"
                                  >
                                    <span className="font-medium text-foreground">{suggestion.address}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {[suggestion.city, suggestion.state, suggestion.postalCode, suggestion.country]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {addressAutocompleteAvailable
                              ? "Select a suggested address to autofill the rest of the form, or continue entering it manually."
                              : "Enter your full shipping address manually. Autocomplete is currently unavailable."}
                          </p>
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
                          {addressVerificationStatus === "verified" ? (
                            <div className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                              <p className="inline-flex items-center gap-2 font-medium">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                Address confirmed
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{addressVerificationMessage}</p>
                            </div>
                          ) : null}
                          {addressVerificationStatus === "invalid" ? (
                            <div className="rounded-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                              <p className="inline-flex items-center gap-2 font-medium">
                                <AlertTriangle className="h-4 w-4" />
                                Address needs attention
                              </p>
                              <p className="mt-1 text-xs">{addressVerificationError}</p>
                            </div>
                          ) : null}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-body text-sm font-semibold text-foreground">Shipping method</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Standard shipping appears here after your address is confirmed.
                              </p>
                            </div>
                            {isShippingLoading ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" /> : null}
                          </div>

                          {!addressFieldsReady ? (
                            <p className="text-sm text-muted-foreground">Complete your shipping address to start verification.</p>
                          ) : addressVerificationStatus === "verifying" ? (
                            <p className="text-sm text-muted-foreground">Confirming your address before loading shipping.</p>
                          ) : addressVerificationStatus === "invalid" ? (
                            <p className="text-sm text-destructive">{addressVerificationError}</p>
                          ) : !shippingAddressReady ? (
                            <p className="text-sm text-muted-foreground">
                              Enter your full name, email, and phone number to load shipping for this address.
                            </p>
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
                                        {option.customerRateMinor === 0 ? "Free" : formatPrice(option.customerRateMinor / 100)}
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
                    <p>Shipping is charged at a flat rate in checkout unless your order qualifies for free shipping.</p>
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
                        {formatPrice(product.price)} x {quantity}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        Size: {selection.size} | Color: {selection.color}
                      </p>
                    </div>
                    <p className="font-display text-sm font-semibold text-foreground sm:text-base">
                      {formatPrice(product.price * quantity)}
                    </p>
                  </div>
                ))}
              </div>

                <div className="space-y-2 border-t border-border pt-4 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  {discountMinor > 0 ? (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Discount ({LAUNCH_DISCOUNT_CODE})</span>
                      <span>-{formatPrice(discount)}</span>
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
                          : formatPrice(shipping)
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
                    <span>Tax ({Math.round(clientCommerceConfig.checkoutTaxRate * 100)}%)</span>
                    <span>{formatPrice(tax)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3 font-display text-lg font-bold text-foreground">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  {isUsd ? (
                    <p className="text-xs text-muted-foreground">
                      USD totals are estimates. Final charges are processed in CAD.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
};

export default Checkout;
