import { useEffect, useMemo, useState, type ReactNode } from "react";
import { type CurrencyCode, convertFromCad, formatCurrency } from "@/lib/money";
import { CurrencyContext, type CurrencyContextValue } from "@/features/currency/context/currency-context";

const STORAGE_KEY = "rias_boutique_currency_v1";
const DEFAULT_CAD_TO_USD_RATE = 0.74;

const resolveCadToUsdRate = () => {
  const raw = (import.meta.env.VITE_CAD_TO_USD_RATE as string | undefined)?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAD_TO_USD_RATE;
};

const resolveDefaultCurrency = (): CurrencyCode => {
  const raw = (import.meta.env.VITE_DEFAULT_CURRENCY as string | undefined)?.trim().toUpperCase();
  return raw === "USD" ? "USD" : "CAD";
};

const readStoredCurrency = (): CurrencyCode | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "USD" || stored === "CAD" ? stored : null;
};

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const cadToUsdRate = resolveCadToUsdRate();
  const [currency, setCurrency] = useState<CurrencyCode>(() => readStoredCurrency() ?? resolveDefaultCurrency());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, currency);
  }, [currency]);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      cadToUsdRate,
      isUsd: currency === "USD",
      formatPrice: (amountCad: number) => formatCurrency(convertFromCad(amountCad, currency, cadToUsdRate), currency),
    }),
    [cadToUsdRate, currency],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};
