import type { CartItem } from "@/features/cart/context/CartContext";
import { extractApiErrorMessage, requestJson } from "@/lib/api-client";

interface CheckoutItemPayload {
  productId: string;
  quantity: number;
}

interface ShippingCustomerPayload {
  deliveryMethod: "shipping" | "pickup";
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface CartTokenResponse {
  cartToken?: string;
  cartTimestamp?: number;
}

interface CloverCheckoutResponse {
  checkoutUrl?: string;
  reused?: boolean;
  orderId?: string;
}

export interface ShippingRateOption {
  token: string;
  carrier: string;
  service: string;
  label: string;
  quotedRateMinor: number;
  customerRateMinor: number;
  currency: string;
  deliveryDays: number | null;
  deliveryDate: string;
  shipmentId: string;
}

export interface AddressAutocompleteSuggestion {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
}

export interface AddressAutocompleteResolvedAddress {
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
}

export interface AddressVerificationResponse {
  verificationStatus?: "verified" | "skipped";
  message?: string;
  normalizedAddress?: {
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    countryCode: string;
  };
  residential?: boolean | null;
}

export interface ShippingRatesResponse {
  provider?: "easypost" | "flat_rate";
  requiresSelection?: boolean;
  freeShippingApplied?: boolean;
  freeShippingThresholdMinor?: number;
  options?: ShippingRateOption[];
  selectedOptionToken?: string;
  quoteExpiresAt?: string;
  message?: string;
}

const normalizeLineItems = (items: CheckoutItemPayload[]) =>
  items
    .map((item) => ({
      productId: item.productId.trim(),
      quantity: item.quantity,
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

export const buildCheckoutItems = (items: CartItem[]): CheckoutItemPayload[] =>
  items.map(({ product, quantity }) => ({
    productId: product.id,
    quantity,
  }));

export const buildClientIdempotencyKey = ({
  email,
  postalCode,
  discountCode,
  items,
  shippingContext = "",
  timeBucket = Math.floor(Date.now() / (15 * 60 * 1000)),
}: {
  email: string;
  postalCode: string;
  discountCode?: string;
  items: CheckoutItemPayload[];
  shippingContext?: string;
  timeBucket?: number;
}) => {
  const normalized = normalizeLineItems(items);
  const payload = `${email.trim().toLowerCase()}|${postalCode.trim().toLowerCase()}|${(discountCode || "").trim().toUpperCase()}|${shippingContext.trim().toLowerCase()}|${JSON.stringify(normalized)}|${timeBucket}`;

  let hash = 5381;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 33) ^ payload.charCodeAt(index);
  }

  const digest = (hash >>> 0).toString(16).padStart(8, "0");
  return `checkout_${digest}_${normalized.length}`;
};

export { extractApiErrorMessage } from "@/lib/api-client";

export const requestOptionalCartToken = async (items: CheckoutItemPayload[]) => {
  try {
    const payload = await requestJson<CartTokenResponse>({
      path: "/api/cart-token",
      method: "POST",
      body: { items },
      fallbackErrorMessage: "Unable to start your cart session.",
    });

    return {
      cartToken: typeof payload.cartToken === "string" ? payload.cartToken : "",
      cartTimestamp: typeof payload.cartTimestamp === "number" ? payload.cartTimestamp : 0,
    };
  } catch {
    return { cartToken: "", cartTimestamp: 0 };
  }
};

export const requestShippingRates = async ({
  customer,
  items,
  signal,
}: {
  customer: ShippingCustomerPayload;
  items: CheckoutItemPayload[];
  signal?: AbortSignal;
}) =>
  requestJson<ShippingRatesResponse>({
    path: "/api/shipping-rates",
    method: "POST",
    signal,
    body: {
      customer,
      items,
    },
    fallbackErrorMessage: "Unable to calculate shipping right now.",
  });

export const requestAddressAutocomplete = async ({
  query,
  country,
  sessionToken,
  signal,
}: {
  query: string;
  country?: string;
  sessionToken?: string;
  signal?: AbortSignal;
}) => {
  const payload = await requestJson<{
    configured?: boolean;
    sessionToken?: string;
    suggestions?: AddressAutocompleteSuggestion[];
  }>({
    path: "/api/address-autocomplete",
    method: "POST",
    signal,
    body: {
      query,
      country,
      sessionToken,
    },
    fallbackErrorMessage: "Unable to load address suggestions right now.",
  });

  return {
    configured: payload.configured !== false,
    sessionToken: typeof payload.sessionToken === "string" ? payload.sessionToken : "",
    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
  };
};

export const requestAddressAutocompleteSelection = async ({
  mapboxId,
  country,
  sessionToken,
  signal,
}: {
  mapboxId: string;
  country?: string;
  sessionToken?: string;
  signal?: AbortSignal;
}) => {
  const payload = await requestJson<{
    configured?: boolean;
    address?: AddressAutocompleteResolvedAddress | null;
  }>({
    path: "/api/address-autocomplete",
    method: "POST",
    signal,
    body: {
      mapboxId,
      country,
      sessionToken,
    },
    fallbackErrorMessage: "Unable to load this address selection right now.",
  });

  return {
    configured: payload.configured !== false,
    address: payload.address || null,
  };
};

export const requestAddressVerification = async ({
  customer,
  signal,
}: {
  customer: ShippingCustomerPayload;
  signal?: AbortSignal;
}) =>
  requestJson<AddressVerificationResponse>({
    path: "/api/address-verify",
    method: "POST",
    signal,
    body: {
      customer,
    },
    fallbackErrorMessage: "Unable to verify this shipping address right now.",
  });

export const requestCloverCheckout = ({
  payload,
  signal,
}: {
  payload: Record<string, unknown>;
  signal?: AbortSignal;
}) =>
  requestJson<CloverCheckoutResponse>({
    path: "/api/clover-checkout",
    method: "POST",
    signal,
    body: payload,
    fallbackErrorMessage: "Unable to start checkout right now.",
  });

export const redirectToCheckout = (checkoutUrl: string) => {
  window.location.assign(checkoutUrl);
};

