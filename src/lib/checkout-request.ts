import type { CartItem } from "@/features/cart/context/CartContext";

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
  provider?: "easypost";
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

export const extractApiErrorMessage = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  const directError = record.error;
  if (typeof directError === "string" && directError.trim()) {
    return directError.trim();
  }

  if (directError && typeof directError === "object") {
    const nested = directError as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message.trim();
    }
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  return fallback;
};

export const requestOptionalCartToken = async (items: CheckoutItemPayload[]) => {
  const response = await fetch("/api/cart-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    return { cartToken: "", cartTimestamp: 0 };
  }

  const payload = (await response.json().catch(() => ({}))) as CartTokenResponse;
  return {
    cartToken: typeof payload.cartToken === "string" ? payload.cartToken : "",
    cartTimestamp: typeof payload.cartTimestamp === "number" ? payload.cartTimestamp : 0,
  };
};

export const requestShippingRates = async ({
  customer,
  items,
  signal,
}: {
  customer: ShippingCustomerPayload;
  items: CheckoutItemPayload[];
  signal?: AbortSignal;
}) => {
  const response = await fetch("/api/shipping-rates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      customer,
      items,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as ShippingRatesResponse;
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, "Unable to calculate shipping right now."));
  }

  return payload;
};

export const requestAddressAutocomplete = async ({
  query,
  country,
  signal,
}: {
  query: string;
  country?: string;
  signal?: AbortSignal;
}) => {
  const response = await fetch("/api/address-autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      query,
      country,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    configured?: boolean;
    suggestions?: AddressAutocompleteSuggestion[];
  };

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, "Unable to load address suggestions right now."));
  }

  return {
    configured: payload.configured !== false,
    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
  };
};

export const requestAddressVerification = async ({
  customer,
  signal,
}: {
  customer: ShippingCustomerPayload;
  signal?: AbortSignal;
}) => {
  const response = await fetch("/api/address-verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      customer,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as AddressVerificationResponse;
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, "Unable to verify this shipping address right now."));
  }

  return payload;
};

export const redirectToCheckout = (checkoutUrl: string) => {
  window.location.assign(checkoutUrl);
};

