const DEFAULT_FREE_SHIPPING_THRESHOLD_MINOR = 40_000;
const DEFAULT_TAX_RATE = 0.05;
const DEFAULT_FLAT_SHIPPING_RATE_MINOR = 3_000;

export type ShippingProviderMode = "flat_rate" | "easypost";

const toBoolean = (value: string | undefined) => value?.trim().toLowerCase() === "true";

export const isShippingChargesEnabled = () => {
  const serverToggle = process.env.ENABLE_SHIPPING_CHARGES;
  if (typeof serverToggle === "string" && serverToggle.trim().length > 0) {
    return toBoolean(serverToggle);
  }

  return toBoolean(process.env.VITE_ENABLE_SHIPPING_CHARGES);
};

export const getFreeShippingThresholdMinor = () => {
  const parsed = Number(process.env.FREE_SHIPPING_THRESHOLD_MINOR);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : DEFAULT_FREE_SHIPPING_THRESHOLD_MINOR;
};

export const getShippingProviderMode = (): ShippingProviderMode => {
  const configured = (process.env.SHIPPING_PROVIDER_MODE || "").trim().toLowerCase();
  return configured === "easypost" ? "easypost" : "flat_rate";
};

export const getFlatShippingRateMinor = () => {
  const parsed = Number(process.env.FLAT_SHIPPING_RATE_MINOR);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : DEFAULT_FLAT_SHIPPING_RATE_MINOR;
};

export const getCheckoutTaxRate = () => {
  const parsed = Number(process.env.CHECKOUT_TAX_RATE);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TAX_RATE;
};

export const buildCheckoutPricing = ({
  subtotalMinor,
  discountMinor,
  shippingMinor,
}: {
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
}) => {
  const discountedSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);
  const taxMinor = Math.round((discountedSubtotalMinor + shippingMinor) * getCheckoutTaxRate());

  return {
    discountMinor,
    discountedSubtotalMinor,
    shippingMinor,
    taxMinor,
    totalMinor: discountedSubtotalMinor + shippingMinor + taxMinor,
  };
};
