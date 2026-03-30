import { createContext } from "react";
import { type CurrencyCode } from "@/lib/money";

export interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (value: CurrencyCode) => void;
  cadToUsdRate: number;
  formatPrice: (amountCad: number) => string;
  isUsd: boolean;
}

export const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);
