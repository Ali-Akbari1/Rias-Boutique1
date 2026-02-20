import type { CartItem } from "@/features/cart/context/CartContext";

interface CheckoutItemPayload {
  productId: string;
  quantity: number;
}

interface CartTokenResponse {
  cartToken?: string;
  cartTimestamp?: number;
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
  timeBucket = Math.floor(Date.now() / (15 * 60 * 1000)),
}: {
  email: string;
  postalCode: string;
  discountCode?: string;
  items: CheckoutItemPayload[];
  timeBucket?: number;
}) => {
  const normalized = normalizeLineItems(items);
  const payload = `${email.trim().toLowerCase()}|${postalCode.trim().toLowerCase()}|${(discountCode || "").trim().toUpperCase()}|${JSON.stringify(normalized)}|${timeBucket}`;

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

export const redirectToCheckout = (checkoutUrl: string) => {
  window.location.assign(checkoutUrl);
};

