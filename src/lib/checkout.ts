const toBoolean = (value: string | undefined) => value?.trim().toLowerCase() === "true";

export const isCheckoutEnabled = () => toBoolean(import.meta.env.VITE_ENABLE_CHECKOUT as string | undefined);
