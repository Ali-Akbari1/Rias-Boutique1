/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
}));

describe("product catalog loader", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileMock.mockReset();
  });

  it("normalizes CMS products that are missing id or name fields", async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        products: [
          {
            slug: "slug-only-product",
            price: 125,
            inventory: "available",
          },
          {
            name: "Name Only Product",
            price: 225,
            inventory: "available",
          },
          {
            price: 325,
            inventory: "available",
          },
        ],
      }),
    );

    const { loadCatalog } = await import("../../server/lib/product-catalog");

    await expect(loadCatalog()).resolves.toEqual([
      expect.objectContaining({
        id: "slug-only-product",
        name: "slug-only-product",
        priceMinor: 12_500,
      }),
      expect.objectContaining({
        id: "2",
        name: "Name Only Product",
        priceMinor: 22_500,
      }),
      expect.objectContaining({
        id: "3",
        name: "Product 3",
        priceMinor: 32_500,
      }),
    ]);
  });
});
