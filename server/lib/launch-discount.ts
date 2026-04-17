import {
  getWelcomeDiscountExpiryDate as getResolvedWelcomeDiscountExpiryDate,
  hasWelcomeDiscountExpiryForConfig,
  isWelcomeDiscountActiveForConfig,
  resolveCommerceConfig,
} from "../../src/shared/config/commerce.js";

const getServerCommerceConfig = () => resolveCommerceConfig(process.env as Record<string, string | undefined>);

export const WELCOME_DISCOUNT_CODE = getServerCommerceConfig().welcomeDiscountCode;
export const WELCOME_DISCOUNT_RATE = getServerCommerceConfig().welcomeDiscountRate;

export const getWelcomeDiscountExpiryIso = () => getServerCommerceConfig().welcomeDiscountExpiresAtIso;

export const getWelcomeDiscountExpiryDate = () => getResolvedWelcomeDiscountExpiryDate(getServerCommerceConfig());

export const hasWelcomeDiscountExpiry = () => hasWelcomeDiscountExpiryForConfig(getServerCommerceConfig());

export const isWelcomeDiscountActive = (now = new Date()) =>
  isWelcomeDiscountActiveForConfig(getServerCommerceConfig(), now);

export const getWelcomeDiscountExpiryDisplay = () => {
  const expiryDate = getWelcomeDiscountExpiryDate();
  if (!expiryDate) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  }).format(expiryDate);
};
