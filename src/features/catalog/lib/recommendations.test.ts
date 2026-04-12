import { describe, expect, it } from "vitest";
import type { Product } from "@/features/catalog/data/products";
import { getCartRecommendations, getSimilarProducts } from "./recommendations";

const makeProduct = (overrides: Partial<Product>): Product => ({
  id: "product-1",
  slug: "product-1",
  name: "Product 1",
  price: 250,
  department: "women",
  image: "/uploads/product-1.webp",
  galleryImages: ["/uploads/product-1.webp"],
  category: "Bridal",
  description: "Handcrafted bridal look",
  availability: "available",
  priceOnInquiry: false,
  tags: ["bridal", "velvet"],
  sizes: ["Medium"],
  colors: ["Burgundy"],
  fabric: "Velvet",
  fitInfo: "Tailored fit",
  careInstructions: ["Dry clean only"],
  deliveryEstimate: "2 weeks",
  popularity: 80,
  createdAt: "2026-04-01",
  ...overrides,
});

describe("recommendation engine", () => {
  it("prioritizes products with shared category and tags", () => {
    const source = makeProduct({ id: "source", slug: "source" });
    const strongMatch = makeProduct({
      id: "strong",
      slug: "strong",
      name: "Strong Match",
      tags: ["bridal", "velvet", "formal"],
      popularity: 60,
    });
    const weakMatch = makeProduct({
      id: "weak",
      slug: "weak",
      name: "Weak Match",
      category: "Formal",
      tags: ["green"],
      popularity: 95,
    });

    const recommendations = getSimilarProducts(source, {
      catalog: [source, weakMatch, strongMatch],
      limit: 2,
    });

    expect(recommendations.map((product) => product.id)).toEqual(["strong", "weak"]);
  });

  it("keeps inquiry-only products out of cart upsells", () => {
    const cartProduct = makeProduct({ id: "cart", slug: "cart" });
    const inquiryOnly = makeProduct({
      id: "inquiry",
      slug: "inquiry",
      priceOnInquiry: true,
      price: null,
      tags: ["bridal", "velvet"],
    });
    const addOn = makeProduct({
      id: "addon",
      slug: "addon",
      category: "Bridal",
      tags: ["bridal", "gold"],
      popularity: 70,
    });

    const recommendations = getCartRecommendations([cartProduct], {
      catalog: [cartProduct, inquiryOnly, addOn],
      limit: 2,
    });

    expect(recommendations.map((product) => product.id)).toEqual(["addon"]);
  });
});
