import {
  getLaunchDiscountExpiryDate as getResolvedLaunchDiscountExpiryDate,
  isLaunchDiscountActiveForConfig,
  resolveCommerceConfig,
} from "../../src/shared/config/commerce.js";

const getServerCommerceConfig = () => resolveCommerceConfig(process.env as Record<string, string | undefined>);

export const LAUNCH_DISCOUNT_CODE = getServerCommerceConfig().launchDiscountCode;
export const LAUNCH_DISCOUNT_RATE = getServerCommerceConfig().launchDiscountRate;

export const getLaunchDiscountExpiryIso = () =>
  getServerCommerceConfig().launchDiscountExpiresAtIso;

export const getLaunchDiscountExpiryDate = () => getResolvedLaunchDiscountExpiryDate(getServerCommerceConfig());

export const isLaunchDiscountActive = (now = new Date()) =>
  isLaunchDiscountActiveForConfig(getServerCommerceConfig(), now);

export const getLaunchDiscountExpiryDisplay = () =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  }).format(getLaunchDiscountExpiryDate());
