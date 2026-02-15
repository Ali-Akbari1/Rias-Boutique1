import { describe, expect, it } from "vitest";
import { type Product } from "@/data/products";
import { buildStripeLineItems, formatCad, getMissingStripeProducts } from "@/lib/stripe";

const buildProduct = (overrides: Partial<Product>): Product => ({
  id: "1",
  slug: "item-a",
  name: "Item A",
  price: 10,
  image: "/a.jpg",
  galleryImages: ["/a.jpg"],
  category: "Test",
  description: "A",
  sizes: ["S"],
  colors: ["Gold"],
  fabric: "Test fabric",
  fitInfo: "True to size",
  careInstructions: ["Dry clean"],
  deliveryEstimate: "5-7 business days",
  popularity: 1,
  createdAt: "2026-01-01",
  ...overrides,
});

describe("stripe helpers", () => {
  it("builds Stripe line items for configured products", () => {
    const lineItems = buildStripeLineItems([
      {
        product: {
          ...buildProduct({ id: "1" }),
          stripePriceId: "price_123",
        },
        quantity: 2,
      },
    ]);

    expect(lineItems).toEqual([{ price: "price_123", quantity: 2 }]);
  });

  it("throws when stripe price id is missing", () => {
    expect(() =>
      buildStripeLineItems([
        {
          product: {
            ...buildProduct({ id: "2", slug: "item-b", name: "Item B", price: 20, image: "/b.jpg", description: "B" }),
          },
          quantity: 1,
        },
      ]),
    ).toThrow("Missing Stripe price ID");
  });

  it("finds products missing Stripe IDs", () => {
    const missing = getMissingStripeProducts([
      {
        product: {
          ...buildProduct({ id: "3", slug: "item-c", name: "Item C", price: 30, image: "/c.jpg", description: "C" }),
          stripePriceId: "price_abc",
        },
        quantity: 1,
      },
      {
        product: {
          ...buildProduct({ id: "4", slug: "item-d", name: "Item D", price: 40, image: "/d.jpg", description: "D" }),
        },
        quantity: 1,
      },
    ]);

    expect(missing).toEqual(["Item D"]);
  });

  it("formats CAD values", () => {
    expect(formatCad(123.45)).toBe("CA$123.45");
  });
});
