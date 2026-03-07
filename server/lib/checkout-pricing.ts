import {
  buildCheckoutPricing as buildResolvedCheckoutPricing,
  resolveCommerceConfig,
  type ShippingProviderMode,
} from "../../src/shared/config/commerce.js";

const getServerCommerceConfig = () => resolveCommerceConfig(process.env as Record<string, string | undefined>);

export const isShippingChargesEnabled = () => {
  return getServerCommerceConfig().shippingChargesEnabled;
};

export const getFreeShippingThresholdMinor = () => getServerCommerceConfig().freeShippingThresholdMinor;

export const getShippingProviderMode = (): ShippingProviderMode => getServerCommerceConfig().shippingProviderMode;

export const getFlatShippingRateMinor = () => getServerCommerceConfig().flatShippingRateMinor;

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
