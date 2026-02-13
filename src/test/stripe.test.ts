import { describe, expect, it } from "vitest";
import { buildStripeLineItems, formatUsd, getMissingStripeProducts } from "@/lib/stripe";

describe("stripe helpers", () => {
  it("builds Stripe line items for configured products", () => {
    const lineItems = buildStripeLineItems([
      {
        product: {
          id: "1",
          name: "Item A",
          price: 10,
          image: "/a.jpg",
          category: "Test",
          description: "A",
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
            id: "2",
            name: "Item B",
            price: 20,
            image: "/b.jpg",
            category: "Test",
            description: "B",
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
          id: "3",
          name: "Item C",
          price: 30,
          image: "/c.jpg",
          category: "Test",
          description: "C",
          stripePriceId: "price_abc",
        },
        quantity: 1,
      },
      {
        product: {
          id: "4",
          name: "Item D",
          price: 40,
          image: "/d.jpg",
          category: "Test",
          description: "D",
        },
        quantity: 1,
      },
    ]);

    expect(missing).toEqual(["Item D"]);
  });

  it("formats USD values", () => {
    expect(formatUsd(123.45)).toBe("$123.45");
  });
});
