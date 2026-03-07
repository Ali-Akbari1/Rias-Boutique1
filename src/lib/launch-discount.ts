import {
  getLaunchDiscountExpiryDate as getResolvedLaunchDiscountExpiryDate,
  isLaunchDiscountActiveForConfig,
} from "@/shared/config/commerce";
import { getClientCommerceConfig } from "@/lib/commerce-config";

const clientCommerceConfig = getClientCommerceConfig();

export const LAUNCH_DISCOUNT_CODE = clientCommerceConfig.launchDiscountCode;
export const LAUNCH_DISCOUNT_RATE = clientCommerceConfig.launchDiscountRate;

export const getLaunchDiscountExpiryIso = () =>
  clientCommerceConfig.launchDiscountExpiresAtIso;

export const getLaunchDiscountExpiryDate = () => getResolvedLaunchDiscountExpiryDate(clientCommerceConfig);

export const isLaunchDiscountActive = (now = new Date()) =>
  isLaunchDiscountActiveForConfig(clientCommerceConfig, now);

export const getLaunchDiscountExpiryDisplay = () =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  }).format(getLaunchDiscountExpiryDate());

export const getLaunchDiscountExpiryDateLabel = () =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeZone: "America/Edmonton",
  }).format(getLaunchDiscountExpiryDate());
