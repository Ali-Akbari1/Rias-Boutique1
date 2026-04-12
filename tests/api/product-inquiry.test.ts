/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/product-inquiry";
import * as email from "../../server/lib/email.js";
import { createMockRequest, createMockResponse } from "./test-utils/utils";

const getDateOffset = (days: number) => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  localDate.setUTCDate(localDate.getUTCDate() + days);
  return localDate.toISOString().slice(0, 10);
};

const buildPayload = () => ({
  productId: "custom-bridal-look",
  productName: "Custom Bridal Look",
  productSku: "custom-bridal-look",
  productUrl: "https://www.riasboutique.com/products/custom-bridal-look",
  selectedVariant: "Size: Medium | Color: Burgundy",
  fullName: "Inquiry Customer",
  email: "customer@example.com",
  phone: "+1 (403) 555-0101",
  location: "Calgary, Alberta",
  requiredByDate: getDateOffset(3),
  occasion: "Wedding",
  sizeNotes: "Bust 40, waist 34",
  message: "I would love a quote for this piece and details on delivery timing.",
  website: "",
});

describe("product inquiry endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.CLOVER_CHECKOUT_BASE_URL = "https://www.riasboutique.com";
  });

  it("sends a product inquiry email", async () => {
    vi.spyOn(email, "sendProductInquiryEmail").mockResolvedValue({
      provider: "mock",
      status: "queued",
      externalId: "",
      recipient: "orders@riasboutique.com",
    });

    const response = createMockResponse();
    await handler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify(buildPayload()),
      }),
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toMatchObject({
      success: true,
      emailProvider: "mock",
      emailStatus: "queued",
    });
    expect(email.sendProductInquiryEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "custom-bridal-look",
        email: "customer@example.com",
      }),
    );
  });

  it("rejects past required-by dates", async () => {
    const response = createMockResponse();
    await handler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
          ...buildPayload(),
          requiredByDate: getDateOffset(-1),
        }),
      }),
      response,
    );

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
      },
    });
  });
});
