import { createDeterministicHash } from "./http.js";
import type { OrderLineItem } from "./order-store.js";

export interface CloverCheckoutServerConfiguration {
  ok: true;
  merchantId: string;
  privateToken: string;
  checkoutBaseUrl: string;
  apiBaseUrl: string;
  pageConfigUuid: string;
  enableTips: boolean;
}

export interface CloverCheckoutServerConfigurationError {
  ok: false;
  error: string;
  details: string;
}

export type CloverCheckoutConfigurationResult =
  | CloverCheckoutServerConfiguration
  | CloverCheckoutServerConfigurationError;

export interface CloverCheckoutLineItem {
  name: string;
  price: number;
  unitQty: number;
}

interface ShippingFingerprintCustomer {
  deliveryMethod?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface BuildCloverLineItemsInput {
  lineItems: OrderLineItem[];
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
}

const DEFAULT_CLOVER_API_BASE_URL = "https://apisandbox.dev.clover.com";

export const getCheckoutBaseUrl = () => process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "";

export const isDebugLoggingEnabled = () => process.env.CLOVER_DEBUG_LOGS?.trim().toLowerCase() === "true";

export const createCheckoutRequestId = () =>
  createDeterministicHash(`${Date.now()}|${Math.random()}`).slice(0, 12);

export const maskValue = (value: string, keepStart = 3, keepEnd = 4) => {
  if (!value) {
    return "";
  }
  if (value.length <= keepStart + keepEnd) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, keepStart)}...${value.slice(-keepEnd)}`;
};

export const safeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const resolveImageUrl = (image: string | undefined, checkoutBaseUrl: string) => {
  const trimmed = (image || "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed, checkoutBaseUrl).toString();
  } catch {
    return trimmed;
  }
};

export const getUrlHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

export const validateServerConfiguration = (): CloverCheckoutConfigurationResult => {
  const merchantId = process.env.CLOVER_MERCHANT_ID?.trim() || "";
  const privateToken = process.env.CLOVER_PRIVATE_TOKEN?.trim() || "";
  const checkoutBaseUrl = getCheckoutBaseUrl();
  const apiBaseUrl = (process.env.CLOVER_API_BASE_URL?.trim() || DEFAULT_CLOVER_API_BASE_URL).replace(/\/+$/, "");

  if (!merchantId || !privateToken) {
    return {
      ok: false,
      error: "Checkout is not available right now. Please try again later.",
      details: "Missing CLOVER_MERCHANT_ID or CLOVER_PRIVATE_TOKEN.",
    };
  }

  if (!checkoutBaseUrl || !checkoutBaseUrl.toLowerCase().startsWith("https://")) {
    return {
      ok: false,
      error: "Checkout is not available right now. Please contact support.",
      details: "CLOVER_CHECKOUT_BASE_URL must be configured with HTTPS.",
    };
  }

  return {
    ok: true,
    merchantId,
    privateToken,
    checkoutBaseUrl: checkoutBaseUrl.replace(/\/+$/, ""),
    apiBaseUrl,
    pageConfigUuid: process.env.CLOVER_PAGE_CONFIG_UUID?.trim() || "",
    enableTips: process.env.CLOVER_ENABLE_TIPS?.trim().toLowerCase() === "true",
  };
};

export const toShippingFingerprint = (customer: ShippingFingerprintCustomer) =>
  [
    customer.deliveryMethod || "shipping",
    customer.address || "",
    customer.city || "",
    customer.state || "",
    customer.postalCode || "",
    customer.country || "",
  ]
    .map((part) => part.trim().toLowerCase())
    .join("|");

/**
 * Clover does not support a cart-level discount line in the same way the site
 * presents one, so discount cents are allocated across product units while
 * preserving the exact order total sent to Clover.
 */
export const buildCloverLineItems = ({
  lineItems,
  discountMinor,
  shippingMinor,
  taxMinor,
}: BuildCloverLineItemsInput): CloverCheckoutLineItem[] => {
  const subtotalMinor = lineItems.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const discountTarget = Math.max(0, Math.min(discountMinor, subtotalMinor));

  const allocatedDiscounts = lineItems.map((item) =>
    discountTarget > 0 && subtotalMinor > 0 ? Math.floor((discountTarget * item.lineTotalMinor) / subtotalMinor) : 0,
  );
  let remainingDiscount = discountTarget - allocatedDiscounts.reduce((sum, value) => sum + value, 0);

  if (remainingDiscount > 0) {
    const sortedIndexes = lineItems
      .map((item, index) => ({ index, lineTotalMinor: item.lineTotalMinor }))
      .sort((a, b) => b.lineTotalMinor - a.lineTotalMinor)
      .map((entry) => entry.index);

    let cursor = 0;
    while (remainingDiscount > 0 && sortedIndexes.length > 0) {
      const targetIndex = sortedIndexes[cursor % sortedIndexes.length] ?? 0;
      allocatedDiscounts[targetIndex] = (allocatedDiscounts[targetIndex] || 0) + 1;
      remainingDiscount -= 1;
      cursor += 1;
    }
  }

  const checkoutLineItems: CloverCheckoutLineItem[] = [];

  for (let index = 0; index < lineItems.length; index += 1) {
    const item = lineItems[index];
    if (!item) {
      continue;
    }

    const itemDiscount = Math.max(0, Math.min(allocatedDiscounts[index] || 0, item.lineTotalMinor));
    const quantity = Math.max(1, item.quantity);
    const basePerUnitDiscount = Math.floor(itemDiscount / quantity);
    const extraUnitDiscountCount = itemDiscount % quantity;

    const regularUnitPrice = Math.max(1, item.unitAmountMinor - basePerUnitDiscount);
    const extraDiscountedUnitPrice = Math.max(1, regularUnitPrice - 1);

    const regularUnitCount = quantity - extraUnitDiscountCount;
    if (regularUnitCount > 0) {
      checkoutLineItems.push({
        name: item.name,
        price: regularUnitPrice,
        unitQty: regularUnitCount,
      });
    }

    if (extraUnitDiscountCount > 0) {
      checkoutLineItems.push({
        name: item.name,
        price: extraDiscountedUnitPrice,
        unitQty: extraUnitDiscountCount,
      });
    }
  }

  if (shippingMinor > 0) {
    checkoutLineItems.push({
      name: "Shipping",
      price: shippingMinor,
      unitQty: 1,
    });
  }

  if (taxMinor > 0) {
    checkoutLineItems.push({
      name: "GST (5%)",
      price: taxMinor,
      unitQty: 1,
    });
  }

  return checkoutLineItems;
};
