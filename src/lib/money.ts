export type CurrencyCode = "CAD" | "USD";

const cadFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCad(amount: number) {
  return cadFormatter.format(amount);
}

export function formatCurrency(amount: number, currency: CurrencyCode) {
  return currency === "USD" ? usdFormatter.format(amount) : cadFormatter.format(amount);
}

export function convertFromCad(amountCad: number, currency: CurrencyCode, cadToUsdRate: number) {
  if (!Number.isFinite(amountCad)) {
    return 0;
  }
  return currency === "USD" ? amountCad * cadToUsdRate : amountCad;
}

export function toMinorCurrencyUnits(amount: number) {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.max(0, Math.round(amount * 100));
}
