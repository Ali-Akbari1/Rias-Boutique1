import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { Product } from "@/data/products";

interface CheckoutItem {
  product: Product;
  quantity: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

let stripePromise: Promise<Stripe | null> | null = null;

export function formatUsd(amount: number) {
  return currencyFormatter.format(amount);
}

export function getStripePublishableKey() {
  return (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
}

export function isStripeConfigured(items: CheckoutItem[]) {
  const hasKey = Boolean(getStripePublishableKey());
  const hasPriceIds = items.every((item) => Boolean(item.product.stripePriceId));
  return hasKey && hasPriceIds;
}

export function getMissingStripeProducts(items: CheckoutItem[]) {
  return items
    .filter((item) => !item.product.stripePriceId)
    .map((item) => item.product.name);
}

export function getStripeClient() {
  const publishableKey = getStripePublishableKey();
  if (!publishableKey) {
    return null;
  }

  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }

  return stripePromise;
}

export function buildStripeLineItems(items: CheckoutItem[]) {
  return items.map((item) => {
    if (!item.product.stripePriceId) {
      throw new Error(`Missing Stripe price ID for ${item.product.name}.`);
    }

    return {
      price: item.product.stripePriceId,
      quantity: item.quantity,
    };
  });
}
