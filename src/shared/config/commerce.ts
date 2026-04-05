export type ShippingProviderMode = "flat_rate" | "easypost";

export interface CommerceRuntimeEnv {
  ENABLE_SHIPPING_CHARGES?: string;
  VITE_ENABLE_SHIPPING_CHARGES?: string;
  FREE_SHIPPING_THRESHOLD_MINOR?: string;
  FLAT_SHIPPING_RATE_MINOR?: string;
  FLAT_SHIPPING_RATE_INTL_MINOR?: string;
  VITE_FLAT_SHIPPING_RATE_INTL_MINOR?: string;
  CHECKOUT_TAX_RATE?: string;
  SHIPPING_PROVIDER_MODE?: string;
  LAUNCH10_EXPIRES_AT?: string;
  VITE_LAUNCH10_EXPIRES_AT?: string;
}

export interface ResolvedCommerceConfig {
  shippingChargesEnabled: boolean;
  freeShippingThresholdMinor: number;
  flatShippingRateMinor: number;
  flatShippingRateInternationalMinor: number;
  checkoutTaxRate: number;
  shippingProviderMode: ShippingProviderMode;
  launchDiscountCode: string;
  launchDiscountRate: number;
  launchDiscountExpiresAtIso: string;
}

export const DEFAULT_FREE_SHIPPING_THRESHOLD_MINOR = 40_000;
export const DEFAULT_FLAT_SHIPPING_RATE_MINOR = 3_000;
export const DEFAULT_FLAT_SHIPPING_RATE_INTL_MINOR = 4_000;
export const DEFAULT_CHECKOUT_TAX_RATE = 0.05;
export const DEFAULT_LAUNCH_DISCOUNT_CODE = "LAUNCH10";
export const DEFAULT_LAUNCH_DISCOUNT_RATE = 0.1;
export const DEFAULT_LAUNCH_DISCOUNT_EXPIRES_AT = "2026-03-21T05:59:59.999Z";

const toBoolean = (value: string | undefined) => value?.trim().toLowerCase() === "true";

const toMinorInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
};

const toRate = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const resolveShippingProviderMode = (value: string | undefined): ShippingProviderMode => {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "easypost" ? "easypost" : "flat_rate";
};

export const resolveCommerceConfig = (env: CommerceRuntimeEnv): ResolvedCommerceConfig => ({
  shippingChargesEnabled:
    typeof env.ENABLE_SHIPPING_CHARGES === "string" && env.ENABLE_SHIPPING_CHARGES.trim().length > 0
      ? toBoolean(env.ENABLE_SHIPPING_CHARGES)
      : toBoolean(env.VITE_ENABLE_SHIPPING_CHARGES),
  freeShippingThresholdMinor: toMinorInteger(
    env.FREE_SHIPPING_THRESHOLD_MINOR,
    DEFAULT_FREE_SHIPPING_THRESHOLD_MINOR,
  ),
  flatShippingRateMinor: toMinorInteger(env.FLAT_SHIPPING_RATE_MINOR, DEFAULT_FLAT_SHIPPING_RATE_MINOR),
  flatShippingRateInternationalMinor: toMinorInteger(
    env.FLAT_SHIPPING_RATE_INTL_MINOR ?? env.VITE_FLAT_SHIPPING_RATE_INTL_MINOR,
    DEFAULT_FLAT_SHIPPING_RATE_INTL_MINOR,
  ),
  checkoutTaxRate: toRate(env.CHECKOUT_TAX_RATE, DEFAULT_CHECKOUT_TAX_RATE),
  shippingProviderMode: resolveShippingProviderMode(env.SHIPPING_PROVIDER_MODE),
  launchDiscountCode: DEFAULT_LAUNCH_DISCOUNT_CODE,
  launchDiscountRate: DEFAULT_LAUNCH_DISCOUNT_RATE,
  launchDiscountExpiresAtIso:
    env.LAUNCH10_EXPIRES_AT?.trim() || env.VITE_LAUNCH10_EXPIRES_AT?.trim() || DEFAULT_LAUNCH_DISCOUNT_EXPIRES_AT,
});

export const getLaunchDiscountExpiryDate = (config: Pick<ResolvedCommerceConfig, "launchDiscountExpiresAtIso">) => {
  const parsed = new Date(config.launchDiscountExpiresAtIso);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(DEFAULT_LAUNCH_DISCOUNT_EXPIRES_AT);
  }
  return parsed;
};

export const isLaunchDiscountActiveForConfig = (
  config: Pick<ResolvedCommerceConfig, "launchDiscountExpiresAtIso">,
  now = new Date(),
) => now.getTime() <= getLaunchDiscountExpiryDate(config).getTime();

export const calculateLaunchDiscountMinor = ({
  subtotalMinor,
  submittedCode,
  launchDiscountCode,
  launchDiscountRate,
  launchDiscountActive,
}: {
  subtotalMinor: number;
  submittedCode: string;
  launchDiscountCode: string;
  launchDiscountRate: number;
  launchDiscountActive: boolean;
}) => {
  if (!launchDiscountActive) {
    return 0;
  }

  const normalizedCode = submittedCode.trim().toUpperCase();
  if (!normalizedCode || normalizedCode !== launchDiscountCode) {
    return 0;
  }

  return Math.round(subtotalMinor * launchDiscountRate);
};

export const buildCheckoutPricing = ({
  subtotalMinor,
  discountMinor,
  shippingMinor,
  taxRate,
}: {
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxRate: number;
}) => {
  const discountedSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);
  const taxMinor = Math.round((discountedSubtotalMinor + shippingMinor) * taxRate);

  return {
    discountMinor,
    discountedSubtotalMinor,
    shippingMinor,
    taxMinor,
    totalMinor: discountedSubtotalMinor + shippingMinor + taxMinor,
  };
};
