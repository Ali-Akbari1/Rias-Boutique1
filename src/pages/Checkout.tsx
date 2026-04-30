import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Lock, Minus, Plus, RotateCcw, Search, ShieldCheck, Truck } from "lucide-react";
import { useCart } from "@/features/cart/context/CartContext";
import { getMaxQuantityForProduct } from "@/features/cart/context/cart-quantity";
import { useToast } from "@/hooks/use-toast";
import { track } from "@vercel/analytics/react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { getClientCommerceConfig } from "@/lib/commerce-config";
import { useCurrency } from "@/features/currency/context/useCurrency";
import { buildCheckoutPricing, calculateWelcomeDiscountMinor } from "@/shared/config/commerce";
import {
  getWelcomeDiscountExpiryDateLabel,
  hasWelcomeDiscountExpiry,
  isWelcomeDiscountActive,
  WELCOME_DISCOUNT_CODE,
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
import { getStorePickupDetails, returnPolicy, shippingPolicy } from "@/features/store/data/store-content";
import { formatProductAlt } from "@/lib/seo";
import {
  formatProductSelectionSummary,
} from "@/features/catalog/data/products";
import {
  buildAddressFingerprint,
  buildFreeShippingThresholdNote,
  createAutocompleteSessionToken,
  findSelectionForItemId,
  getCheckoutShippingGuard,
  getNextSelectedShippingToken,
  getSelectedShippingOption,
  hasSameCheckoutAddress,
  initialCheckoutForm,
  initialTouchedCheckoutFields,
  isAbortError,
  isAddressFieldsComplete,
  isAutocompleteNotConfiguredError,
  isShippingAddressComplete,
  looksLikeEmail,
  mergeNormalizedAddress,
  normalizeCountryCode,
  resolveAddressSuggestionSelection,
  type AddressVerificationStatus,
  type CheckoutAddressFields,
  type CheckoutForm,
  type TouchedCheckoutFields,
} from "@/pages/checkout-helpers";

const clientCommerceConfig = getClientCommerceConfig();

const Checkout = () => {
  const { items, totalPrice, addToCart, updateQuantity, removeFromCart } = useCart();
  const { toast } = useToast();
  const { formatPrice, isUsd } = useCurrency();
  const [searchParams] = useSearchParams();
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(initialCheckoutForm);
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
  const [touchedFields, setTouchedFields] = useState<TouchedCheckoutFields>(initialTouchedCheckoutFields);
  const setFieldTouched = (field: keyof TouchedCheckoutFields) => {
    setTouchedFields((current) => (current[field] ? current : { ...current, [field]: true }));
  };
  const [lastVerifiedAddressFingerprint, setLastVerifiedAddressFingerprint] = useState("");
  const pickupDetails = getStorePickupDetails();
  const shippingChargesEnabled = clientCommerceConfig.shippingChargesEnabled;
  const welcomeDiscountActive = isWelcomeDiscountActive();
  const welcomeDiscountEndsLabel = getWelcomeDiscountExpiryDateLabel();
  const welcomeDiscountHasExpiry = hasWelcomeDiscountExpiry();
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
  const checkoutItemAppliedRef = useRef(false);

  const checkoutItems = useMemo(() => buildCheckoutItems(items), [items]);
  const subtotalMinor = Math.round(totalPrice * 100);
  const normalizedDiscountCode = discountCode.trim().toUpperCase();
  const effectiveDiscountCode = welcomeDiscountActive ? normalizedDiscountCode : "";
  const discountMinor = calculateWelcomeDiscountMinor({
    subtotalMinor,
    submittedCode: effectiveDiscountCode,
    welcomeDiscountCode: clientCommerceConfig.welcomeDiscountCode,
    welcomeDiscountRate: clientCommerceConfig.welcomeDiscountRate,
    welcomeDiscountActive,
  });
  const isPickupInStore = checkoutForm.deliveryMethod === "pickup";
  const selectedShippingOption = useMemo(
    () => getSelectedShippingOption(shippingOptions, selectedShippingToken),
    [selectedShippingToken, shippingOptions],
  );
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
  const freeShippingThresholdCad = clientCommerceConfig.freeShippingThresholdMinor / 100;
  const freeShippingRemainingCad = Math.max(0, freeShippingThresholdCad - subtotal);
  const qualifiesForFreeShipping = freeShippingThresholdCad > 0 && subtotal >= freeShippingThresholdCad;
  const freeShippingProgress =
    freeShippingThresholdCad > 0 ? Math.min(1, subtotal / freeShippingThresholdCad) : 1;
  const addressFieldsReady = isAddressFieldsComplete(checkoutForm);
  const shippingAddressReady = isShippingAddressComplete(checkoutForm);
  const normalizedCountry = normalizeCountryCode(checkoutForm.country);
  const hasShippingCountry = normalizedCountry.length > 0;
  const isCanadaDestination = normalizedCountry === "CA";
  const isUsDestination = normalizedCountry === "US";
  const showFreeShippingProgress =
    !isPickupInStore && freeShippingThresholdCad > 0 && (!hasShippingCountry || isCanadaDestination);
  const fullNameValid = checkoutForm.fullName.trim().length >= 2;
  const emailValid = looksLikeEmail(checkoutForm.email);
  const phoneValid = checkoutForm.phone.trim().length >= 7;
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
  const freeShippingThresholdNote = buildFreeShippingThresholdNote({
    isPickupInStore,
    freeShippingApplied,
    selectedShippingOption,
    hasShippingCountry,
    isCanadaDestination,
    isUsDestination,
    freeShippingThresholdMinor: clientCommerceConfig.freeShippingThresholdMinor,
    flatShippingRateMinor: clientCommerceConfig.flatShippingRateMinor,
    flatShippingRateInternationalMinor: clientCommerceConfig.flatShippingRateInternationalMinor,
    formatPrice,
  });

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
  }: CheckoutAddressFields) => {
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
      const resolvedAddress = payload.address;
      setAddressAutocompleteAvailable(payload.configured);
      applySuggestedAddressSelection(resolveAddressSuggestionSelection(suggestion, resolvedAddress));
    } catch (error) {
      if (isAbortError(error)) {
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
    if (checkoutItemAppliedRef.current) {
      return;
    }

    const itemId = searchParams.get("item_id") || "";
    if (!itemId.trim()) {
      return;
    }

    checkoutItemAppliedRef.current = true;
    const match = findSelectionForItemId(itemId);
    if (match) {
      addToCart(match.product, match.selection);
    }
  }, [addToCart, searchParams]);

  useEffect(() => {
    if (!welcomeDiscountActive && discountCode) {
      setDiscountCode("");
    }
  }, [welcomeDiscountActive, discountCode]);

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
      "width=device-width, initial-scale=1.0, viewport-fit=cover",
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
          if (isAbortError(error)) {
            return;
          }

          setAddressSuggestions([]);
          setIsAddressSuggestionsOpen(false);
          if (isAutocompleteNotConfiguredError(error)) {
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
          const nextForm = mergeNormalizedAddress(checkoutForm, payload.normalizedAddress);
          const nextFingerprint = buildAddressFingerprint(nextForm);

          setCheckoutForm((current) => {
            if (hasSameCheckoutAddress(current, nextForm)) {
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
          if (isAbortError(error)) {
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
            getNextSelectedShippingToken(nextOptions, current, payload.selectedOptionToken),
          );
          setShippingMessage(payload.message || "");
          setShippingError(nextOptions.length === 0 ? "No shipping rates are available for this address yet." : "");
        })
        .catch((error) => {
          if (isAbortError(error)) {
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

    const shippingGuard = getCheckoutShippingGuard({
      isPickupInStore,
      addressFieldsReady,
      addressVerificationStatus,
      isAddressVerified,
      addressVerificationError,
      shippingAddressReady,
      isShippingLoading,
      shippingError,
      selectedShippingOption,
    });
    if (shippingGuard) {
      toast({
        title: shippingGuard.title,
        description: shippingGuard.description,
        variant: "destructive",
      });
      return;
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
      if (isAbortError(error) && document.visibilityState === "hidden") {
        return;
      }

      const message =
        isAbortError(error)
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
                        onBlur={() => setFieldTouched("fullName")}
                        autoComplete="name"
                      />
                      {touchedFields.fullName ? (
                        fullNameValid ? (
                          <p className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Looks good
                          </p>
                        ) : (
                          <p className="inline-flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Enter your full name
                          </p>
                        )
                      ) : null}
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
                        onBlur={() => setFieldTouched("email")}
                        autoComplete="email"
                      />
                      {touchedFields.email ? (
                        emailValid ? (
                          <p className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Email looks good
                          </p>
                        ) : (
                          <p className="inline-flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Enter a valid email address
                          </p>
                        )
                      ) : null}
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
                        onBlur={() => setFieldTouched("phone")}
                        autoComplete="tel"
                      />
                      {touchedFields.phone ? (
                        phoneValid ? (
                          <p className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Phone looks good
                          </p>
                        ) : (
                          <p className="inline-flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Enter a valid phone number
                          </p>
                        )
                      ) : null}
                    </div>

                      {welcomeDiscountActive ? (
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
                              {normalizedDiscountCode !== WELCOME_DISCOUNT_CODE
                                ? "Invalid code."
                                : `${WELCOME_DISCOUNT_CODE} entered. Eligibility is verified at checkout for email subscribers placing their first order.`}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Have a welcome code? Enter it above for 10% off your first order.
                              {welcomeDiscountHasExpiry ? ` Offer ends ${welcomeDiscountEndsLabel}.` : ""}
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
                <CardTitle className="font-display text-2xl">Shipping & Returns</CardTitle>
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
                    <p>Shipping is charged at a flat rate in checkout unless your Canada order qualifies for free shipping.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="font-semibold text-foreground">Free shipping</p>
                    <p>Orders over {shippingPolicy.freeShippingThreshold} qualify for free standard shipping.</p>
                  </div>
                </div>

                <div>
                  <p className="mt-1">{returnPolicy}</p>
                </div>
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
                {items.map(({ id, product, selection, quantity }) => {
                  const maxQuantity = getMaxQuantityForProduct(product);
                  const isMaxQuantity = maxQuantity <= 0 || quantity >= maxQuantity;
                  const unitPrice = product.price ?? 0;
                  const selectionSummary = formatProductSelectionSummary(product, selection);

                  return (
                    <div
                      key={id}
                      className="grid min-w-0 grid-cols-[auto_1fr_auto] gap-2.5 rounded-md border border-border bg-background p-2.5 sm:gap-3 sm:p-3"
                    >
                      <img
                        src={product.image}
                        alt={formatProductAlt(product)}
                        className="h-16 w-14 rounded-sm object-cover sm:h-20 sm:w-16"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-display text-sm font-semibold text-foreground sm:text-base">
                          {product.name}
                        </p>
                        <p className="font-body text-xs text-muted-foreground sm:text-sm">
                          {formatPrice(unitPrice)} x {quantity}
                        </p>
                        {selectionSummary ? (
                          <p className="font-body text-xs text-muted-foreground">{selectionSummary}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateQuantity(id, quantity - 1)}
                              className="h-7 w-7 rounded-sm border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="font-body text-xs text-foreground">{quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(id, quantity + 1)}
                              disabled={isMaxQuantity}
                              title={
                                isMaxQuantity
                                  ? maxQuantity <= 0
                                    ? "Sold out"
                                    : `Limit ${maxQuantity} per item`
                                  : "Increase quantity"
                              }
                              className={`h-7 w-7 rounded-sm border border-border flex items-center justify-center text-foreground transition-colors ${
                                isMaxQuantity ? "cursor-not-allowed opacity-40" : "hover:bg-secondary"
                              }`}
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex h-full flex-col items-end justify-between">
                        <p className="font-display text-sm font-semibold text-foreground sm:text-base">
                          {formatPrice(unitPrice * quantity)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeFromCart(id)}
                          className="text-xs text-muted-foreground hover:text-destructive font-body transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discountMinor > 0 ? (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Estimated discount ({WELCOME_DISCOUNT_CODE})</span>
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
                  {showFreeShippingProgress ? (
                    <div className="rounded-md border border-border/70 bg-card/40 p-3">
                      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <span>Free Shipping</span>
                        <span>
                          {formatPrice(Math.min(subtotal, freeShippingThresholdCad))} /{" "}
                          {formatPrice(freeShippingThresholdCad)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground transition-all duration-300"
                          style={{ width: `${freeShippingProgress * 100}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-body text-muted-foreground">
                        {qualifiesForFreeShipping
                          ? "You qualify for free shipping in Canada."
                          : `You're ${formatPrice(freeShippingRemainingCad)} away from free shipping in Canada.`}
                      </p>
                      {isUsd ? (
                        <p className="text-[11px] font-body text-muted-foreground">
                          Threshold is CA$400 for Canada orders (USD shown is an estimate).
                        </p>
                      ) : (
                        <p className="text-[11px] font-body text-muted-foreground">
                          Applies to Canada orders over CA$400.
                        </p>
                      )}
                    </div>
                  ) : null}
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
