import {
  getProductById,
  getProductBySlug,
  products,
  type Product,
} from "@/features/catalog/data/products";
import type {
  AddressAutocompleteResolvedAddress,
  AddressAutocompleteSuggestion,
  AddressVerificationResponse,
  ShippingRateOption,
} from "@/lib/checkout-request";

export type DeliveryMethod = "shipping" | "pickup";
export type AddressVerificationStatus = "idle" | "verifying" | "verified" | "invalid" | "skipped";

export interface CheckoutForm {
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

export interface TouchedCheckoutFields {
  fullName: boolean;
  email: boolean;
  phone: boolean;
}

export type CheckoutAddressFields = Pick<CheckoutForm, "address" | "city" | "state" | "postalCode" | "country">;

interface ProductSelection {
  size: string;
  color: string;
}

interface CheckoutItemMatch {
  product: Product;
  selection: ProductSelection;
}

interface FreeShippingThresholdNoteInput {
  isPickupInStore: boolean;
  freeShippingApplied: boolean;
  selectedShippingOption: ShippingRateOption | null;
  isCanadaOrUsDestination: boolean;
  isUsDestination: boolean;
  freeShippingThresholdMinor: number;
  flatShippingRateMinor: number;
  flatShippingRateInternationalMinor: number;
  formatPrice: (amountCad: number) => string;
}

interface CheckoutShippingGuardInput {
  isPickupInStore: boolean;
  addressFieldsReady: boolean;
  addressVerificationStatus: AddressVerificationStatus;
  isAddressVerified: boolean;
  addressVerificationError: string;
  shippingAddressReady: boolean;
  isShippingLoading: boolean;
  shippingError: string;
  selectedShippingOption: ShippingRateOption | null;
}

export interface CheckoutShippingGuard {
  title: string;
  description: string;
}

export const initialCheckoutForm: CheckoutForm = {
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

export const initialTouchedCheckoutFields: TouchedCheckoutFields = {
  fullName: false,
  email: false,
  phone: false,
};

export const looksLikeEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

export const isAddressFieldsComplete = (form: CheckoutForm) =>
  form.deliveryMethod === "shipping" &&
  form.address.trim().length >= 4 &&
  form.city.trim().length >= 2 &&
  form.state.trim().length >= 2 &&
  form.postalCode.trim().length >= 3 &&
  form.country.trim().length >= 2;

export const isShippingAddressComplete = (form: CheckoutForm) =>
  isAddressFieldsComplete(form) &&
  form.fullName.trim().length >= 2 &&
  looksLikeEmail(form.email) &&
  form.phone.trim().length >= 7;

export const buildAddressFingerprint = (form: CheckoutForm) =>
  [form.address, form.city, form.state, form.postalCode, form.country]
    .map((value) => value.trim().toLowerCase())
    .join("|");

export const normalizeCountryCode = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const compact = trimmed.replace(/[^a-z]/g, "");
  if (["ca", "can", "canada"].includes(compact)) {
    return "CA";
  }
  if (["us", "usa", "unitedstates", "unitedstatesofamerica"].includes(compact)) {
    return "US";
  }

  return trimmed.toUpperCase();
};

const slugifyOption = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildVariantId = (baseId: string, size: string, color: string) => {
  const sizeSlug = slugifyOption(size) || "one-size";
  const colorSlug = slugifyOption(color) || "default";
  return `${baseId}-${sizeSlug}-${colorSlug}`;
};

const getDefaultSelection = (product: Product): ProductSelection => ({
  size: product.sizes[0] || "One Size",
  color: product.colors[0] || "Default",
});

/**
 * CMS and merchant-feed links can point at either a product id/slug or a concrete
 * variant id, so checkout needs to preserve both lookup modes for deep links.
 */
export const findSelectionForItemId = (itemId: string): CheckoutItemMatch | null => {
  const trimmed = itemId.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = getProductById(trimmed) || getProductBySlug(trimmed);
  if (directMatch) {
    return { product: directMatch, selection: getDefaultSelection(directMatch) };
  }

  for (const product of products) {
    const sizes = product.sizes.length > 0 ? product.sizes : ["One Size"];
    const colors = product.colors.length > 0 ? product.colors : ["Default"];

    for (const size of sizes) {
      for (const color of colors) {
        if (buildVariantId(product.id, size, color) === trimmed) {
          return { product, selection: { size, color } };
        }
      }
    }
  }

  return null;
};

export const createAutocompleteSessionToken = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `mapbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const isAbortError = (error: unknown) => error instanceof Error && error.name === "AbortError";

export const isAutocompleteNotConfiguredError = (error: unknown) =>
  error instanceof Error && error.message.includes("not configured");

export const resolveAddressSuggestionSelection = (
  suggestion: AddressAutocompleteSuggestion,
  resolvedAddress?: AddressAutocompleteResolvedAddress,
): CheckoutAddressFields => ({
  address: resolvedAddress?.address || suggestion.address,
  city: resolvedAddress?.city || suggestion.city,
  state: resolvedAddress?.state || suggestion.state,
  postalCode: resolvedAddress?.postalCode || suggestion.postalCode,
  country: resolvedAddress?.country || suggestion.country,
});

export const mergeNormalizedAddress = (
  form: CheckoutForm,
  normalizedAddress: AddressVerificationResponse["normalizedAddress"],
): CheckoutForm =>
  normalizedAddress
    ? {
        ...form,
        address: normalizedAddress.address,
        city: normalizedAddress.city,
        state: normalizedAddress.state,
        postalCode: normalizedAddress.postalCode,
        country: normalizedAddress.country,
      }
    : form;

export const hasSameCheckoutAddress = (current: CheckoutForm, next: CheckoutForm) =>
  current.address === next.address &&
  current.city === next.city &&
  current.state === next.state &&
  current.postalCode === next.postalCode &&
  current.country === next.country;

export const getSelectedShippingOption = (options: ShippingRateOption[], selectedToken: string) =>
  options.find((option) => option.token === selectedToken) || options[0] || null;

export const getNextSelectedShippingToken = (
  options: ShippingRateOption[],
  currentToken: string,
  serverSelectedToken?: string,
) =>
  options.some((option) => option.token === currentToken)
    ? currentToken
    : serverSelectedToken || options[0]?.token || "";

export const buildFreeShippingThresholdNote = ({
  isPickupInStore,
  freeShippingApplied,
  selectedShippingOption,
  isCanadaOrUsDestination,
  isUsDestination,
  freeShippingThresholdMinor,
  flatShippingRateMinor,
  flatShippingRateInternationalMinor,
  formatPrice,
}: FreeShippingThresholdNoteInput) => {
  const thresholdLabel = formatPrice(freeShippingThresholdMinor / 100);

  if (isPickupInStore) {
    return "Pick up in store selected. No shipping fee will be charged.";
  }

  if (freeShippingApplied && selectedShippingOption) {
    return `Free shipping on orders over ${thresholdLabel} (Canada & US only). Applied to ${selectedShippingOption.label}.`;
  }

  if (selectedShippingOption && !isCanadaOrUsDestination) {
    return `International shipping is a flat ${formatPrice(selectedShippingOption.customerRateMinor / 100)} at checkout.`;
  }

  if (selectedShippingOption) {
    const deliveryLabel = selectedShippingOption.deliveryDays
      ? ` estimated ${selectedShippingOption.deliveryDays} business day${selectedShippingOption.deliveryDays === 1 ? "" : "s"}.`
      : ".";
    return `${selectedShippingOption.label}${deliveryLabel} Orders under ${thresholdLabel} are charged ${formatPrice(
      selectedShippingOption.customerRateMinor / 100,
    )} shipping.`;
  }

  if (isCanadaOrUsDestination) {
    const fallbackRateMinor = isUsDestination ? flatShippingRateInternationalMinor : flatShippingRateMinor;
    return `Orders under ${thresholdLabel} are charged ${formatPrice(fallbackRateMinor / 100)} shipping.`;
  }

  return `International shipping is a flat ${formatPrice(flatShippingRateInternationalMinor / 100)} at checkout.`;
};

export const getCheckoutShippingGuard = ({
  isPickupInStore,
  addressFieldsReady,
  addressVerificationStatus,
  isAddressVerified,
  addressVerificationError,
  shippingAddressReady,
  isShippingLoading,
  shippingError,
  selectedShippingOption,
}: CheckoutShippingGuardInput): CheckoutShippingGuard | null => {
  if (isPickupInStore) {
    return null;
  }

  if (!addressFieldsReady) {
    return {
      title: "Shipping address required",
      description: "Enter your shipping address so we can confirm it before loading carrier rates.",
    };
  }

  if (addressVerificationStatus === "verifying") {
    return {
      title: "Address still confirming",
      description: "Wait for address confirmation to finish before continuing to payment.",
    };
  }

  if (!isAddressVerified) {
    return {
      title: "Address confirmation required",
      description: addressVerificationError || "Confirm your shipping address before continuing to payment.",
    };
  }

  if (!shippingAddressReady) {
    return {
      title: "Contact details required",
      description: "Enter your full name, email, and phone number to load shipping before checkout.",
    };
  }

  if (isShippingLoading) {
    return {
      title: "Shipping still loading",
      description: "Wait for live shipping rates to finish loading before continuing.",
    };
  }

  if (shippingError || !selectedShippingOption) {
    return {
      title: "Shipping option required",
      description: shippingError || "Select a shipping option before continuing to payment.",
    };
  }

  return null;
};
