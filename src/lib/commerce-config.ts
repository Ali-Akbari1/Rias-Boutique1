import {
  getWelcomeDiscountExpiryDate,
  isWelcomeDiscountActiveForConfig,
  resolveCommerceConfig,
  type ResolvedCommerceConfig,
} from "@/shared/config/commerce";

const clientCommerceConfig = resolveCommerceConfig(import.meta.env as Record<string, string | undefined>);

export const getClientCommerceConfig = (): ResolvedCommerceConfig => clientCommerceConfig;

export const getClientWelcomeDiscountExpiryDate = () => getWelcomeDiscountExpiryDate(clientCommerceConfig);

export const isClientWelcomeDiscountActive = (now = new Date()) =>
  isWelcomeDiscountActiveForConfig(clientCommerceConfig, now);
