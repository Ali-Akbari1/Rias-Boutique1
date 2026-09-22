import {
  buildCheckoutPricing as buildResolvedCheckoutPricing,
  calculateShippingPromotionMinor,
  getShippingPromotion,
  resolveCommerceConfig,
  type ShippingProviderMode,
} from "../../src/shared/config/commerce.js";

export { calculateShippingPromotionMinor, getShippingPromotion };

const getServerCommerceConfig = () => resolveCommerceConfig(process.env as Record<string, string | undefined>);

export const isShippingChargesEnabled = () => {
  return getServerCommerceConfig().shippingChargesEnabled;
};

export const getFreeShippingThresholdMinor = () => getServerCommerceConfig().freeShippingThresholdMinor;

export const getShippingProviderMode = (): ShippingProviderMode => getServerCommerceConfig().shippingProviderMode;

export const getFlatShippingRateMinor = () => getServerCommerceConfig().flatShippingRateMinor;
export const getInternationalFlatShippingRateMinor = () =>
  getServerCommerceConfig().flatShippingRateInternationalMinor;

export const getCheckoutTaxRate = () => getServerCommerceConfig().checkoutTaxRate;

export const buildCheckoutPricing = ({
  subtotalMinor,
  discountMinor,
  shippingMinor,
}: {
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
}) => {
  return buildResolvedCheckoutPricing({
    subtotalMinor,
    discountMinor,
    shippingMinor,
    taxRate: getCheckoutTaxRate(),
  });
};
