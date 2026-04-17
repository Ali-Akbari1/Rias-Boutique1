import {
  getWelcomeDiscountExpiryDate as getResolvedWelcomeDiscountExpiryDate,
  hasWelcomeDiscountExpiryForConfig,
  isWelcomeDiscountActiveForConfig,
} from "@/shared/config/commerce";
import { getClientCommerceConfig } from "@/lib/commerce-config";

const clientCommerceConfig = getClientCommerceConfig();

export const WELCOME_DISCOUNT_CODE = clientCommerceConfig.welcomeDiscountCode;
export const WELCOME_DISCOUNT_RATE = clientCommerceConfig.welcomeDiscountRate;

export const getWelcomeDiscountExpiryIso = () => clientCommerceConfig.welcomeDiscountExpiresAtIso;

export const getWelcomeDiscountExpiryDate = () => getResolvedWelcomeDiscountExpiryDate(clientCommerceConfig);

export const hasWelcomeDiscountExpiry = () => hasWelcomeDiscountExpiryForConfig(clientCommerceConfig);

export const isWelcomeDiscountActive = (now = new Date()) =>
  isWelcomeDiscountActiveForConfig(clientCommerceConfig, now);

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

export const getWelcomeDiscountExpiryDateLabel = () => {
  const expiryDate = getWelcomeDiscountExpiryDate();
  if (!expiryDate) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeZone: "America/Edmonton",
  }).format(expiryDate);
};
