const cadFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "CAD",
});

export function formatCad(amount: number) {
  return cadFormatter.format(amount);
}

export function toMinorCurrencyUnits(amount: number) {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.max(0, Math.round(amount * 100));
}
