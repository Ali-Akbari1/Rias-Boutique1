import {
  getLaunchDiscountExpiryDate,
  isLaunchDiscountActiveForConfig,
  resolveCommerceConfig,
  type ResolvedCommerceConfig,
} from "@/shared/config/commerce";

const clientCommerceConfig = resolveCommerceConfig(import.meta.env as Record<string, string | undefined>);

export const getClientCommerceConfig = (): ResolvedCommerceConfig => clientCommerceConfig;

export const getClientLaunchDiscountExpiryDate = () => getLaunchDiscountExpiryDate(clientCommerceConfig);

export const isClientLaunchDiscountActive = (now = new Date()) =>
  isLaunchDiscountActiveForConfig(clientCommerceConfig, now);
