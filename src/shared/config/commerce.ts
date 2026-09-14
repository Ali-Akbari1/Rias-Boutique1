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
  WELCOME_DISCOUNT_CODE?: string;
  VITE_WELCOME_DISCOUNT_CODE?: string;
  WELCOME_DISCOUNT_RATE?: string;
  VITE_WELCOME_DISCOUNT_RATE?: string;
  WELCOME_DISCOUNT_STARTS_AT?: string;
  VITE_WELCOME_DISCOUNT_STARTS_AT?: string;
  WELCOME_DISCOUNT_EXPIRES_AT?: string;
  VITE_WELCOME_DISCOUNT_EXPIRES_AT?: string;
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
  welcomeDiscountCode: string;
  welcomeDiscountRate: number;
  welcomeDiscountStartsAtIso: string;
  welcomeDiscountExpiresAtIso: string;
}

export const DEFAULT_FREE_SHIPPING_THRESHOLD_MINOR = 40_000;
export const DEFAULT_FLAT_SHIPPING_RATE_MINOR = 3_000;
export const DEFAULT_FLAT_SHIPPING_RATE_INTL_MINOR = 4_000;
export const DEFAULT_CHECKOUT_TAX_RATE = 0.05;
// Fall Style Event: 7:00 PM Calgary time, September 14 to September 16, 2026.
// These values intentionally take precedence over older WELCOME_* deployment
// variables so the scheduled campaign cannot accidentally reuse an expired code.
export const DEFAULT_WELCOME_DISCOUNT_CODE = "FALL10";
export const DEFAULT_WELCOME_DISCOUNT_RATE = 0.1;
export const DEFAULT_WELCOME_DISCOUNT_STARTS_AT = "2026-09-15T01:00:00.000Z";
export const DEFAULT_WELCOME_DISCOUNT_EXPIRES_AT = "2026-09-17T01:00:00.000Z";

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
  welcomeDiscountCode: DEFAULT_WELCOME_DISCOUNT_CODE,
  welcomeDiscountRate: DEFAULT_WELCOME_DISCOUNT_RATE,
  welcomeDiscountStartsAtIso: DEFAULT_WELCOME_DISCOUNT_STARTS_AT,
  welcomeDiscountExpiresAtIso: DEFAULT_WELCOME_DISCOUNT_EXPIRES_AT,
});

export const getWelcomeDiscountStartDate = (
  config: Pick<ResolvedCommerceConfig, "welcomeDiscountStartsAtIso">,
) => {
  const startsAtIso = config.welcomeDiscountStartsAtIso.trim();
  if (!startsAtIso) {
    return null;
  }

  const parsed = new Date(startsAtIso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getWelcomeDiscountExpiryDate = (
  config: Pick<ResolvedCommerceConfig, "welcomeDiscountExpiresAtIso">,
) => {
  const expiresAtIso = config.welcomeDiscountExpiresAtIso.trim();
  if (!expiresAtIso) {
    return null;
  }

  const parsed = new Date(expiresAtIso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

export const hasWelcomeDiscountExpiryForConfig = (
  config: Pick<ResolvedCommerceConfig, "welcomeDiscountExpiresAtIso">,
) => Boolean(getWelcomeDiscountExpiryDate(config));

export const isWelcomeDiscountActiveForConfig = (
  config: Pick<ResolvedCommerceConfig, "welcomeDiscountStartsAtIso" | "welcomeDiscountExpiresAtIso">,
  now = new Date(),
) => {
  const startDate = getWelcomeDiscountStartDate(config);
  const expiryDate = getWelcomeDiscountExpiryDate(config);
  return (!startDate || now.getTime() >= startDate.getTime()) && (!expiryDate || now.getTime() <= expiryDate.getTime());
};

export const calculateWelcomeDiscountMinor = ({
  subtotalMinor,
  submittedCode,
  welcomeDiscountCode,
  welcomeDiscountRate,
  welcomeDiscountActive,
}: {
  subtotalMinor: number;
  submittedCode: string;
  welcomeDiscountCode: string;
  welcomeDiscountRate: number;
  welcomeDiscountActive: boolean;
}) => {
  if (!welcomeDiscountActive) {
    return 0;
  }

  const normalizedCode = submittedCode.trim().toUpperCase();
  if (!normalizedCode || normalizedCode !== welcomeDiscountCode) {
    return 0;
  }

  return Math.round(subtotalMinor * welcomeDiscountRate);
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
