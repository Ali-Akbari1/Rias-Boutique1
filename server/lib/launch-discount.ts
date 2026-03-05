const DEFAULT_LAUNCH_DISCOUNT_EXPIRES_AT = "2026-03-18T05:59:59.999Z";

export const LAUNCH_DISCOUNT_CODE = "LAUNCH10";
export const LAUNCH_DISCOUNT_RATE = 0.1;

export const getLaunchDiscountExpiryIso = () =>
  process.env.LAUNCH10_EXPIRES_AT?.trim() || DEFAULT_LAUNCH_DISCOUNT_EXPIRES_AT;

export const getLaunchDiscountExpiryDate = () => {
  const rawValue = getLaunchDiscountExpiryIso();
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(DEFAULT_LAUNCH_DISCOUNT_EXPIRES_AT);
  }
  return parsed;
};

export const isLaunchDiscountActive = (now = new Date()) =>
  now.getTime() <= getLaunchDiscountExpiryDate().getTime();

export const getLaunchDiscountExpiryDisplay = () =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  }).format(getLaunchDiscountExpiryDate());

