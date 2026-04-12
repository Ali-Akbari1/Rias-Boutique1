import { isPurchasableProduct, type Product } from "@/features/catalog/data/products";

const HARD_MAX_ITEM_QUANTITY = 10;

const normalizeMaxQuantity = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.floor(parsed));
};

export const getMaxQuantityForProduct = (product: Product) => {
  if (!isPurchasableProduct(product)) {
    return 0;
  }

  const configured = normalizeMaxQuantity(product.maxQuantity);
  if (configured === null) {
    return 1;
  }

  return Math.min(Math.max(1, configured), HARD_MAX_ITEM_QUANTITY);
};
