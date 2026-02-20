/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/clover-checkout";
import { createMockRequest, createMockResponse } from "./test-utils/utils";
import { closeOrderStoreForTests, resetOrderStoreForTests } from "../../server/lib/order-store.js";

const makeCheckoutBody = () => ({
  customer: {
    fullName: "Test Customer",
    email: "test@example.com",
    phone: "+1 (403) 555-0101",
    address: "123 Main St",
    city: "Calgary",
    state: "Alberta",
    postalCode: "T2X 1A1",
    country: "Canada",
  },
  items: [{ productId: "Royal-Blue", quantity: 2 }],
});

describe("clover checkout endpoint", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    process.env.ORDER_STORE_ADAPTER = "memory";
    await closeOrderStoreForTests();
    process.env.CLOVER_MERCHANT_ID = "merchant_123";
    process.env.CLOVER_PRIVATE_TOKEN = "private_token_123";
    process.env.CLOVER_CHECKOUT_BASE_URL = "https://www.riasboutique.com";
    process.env.CLOVER_API_BASE_URL = "https://apisandbox.dev.clover.com";
    process.env.ENABLE_SHIPPING_CHARGES = "";

    await resetOrderStoreForTests();
  });

  it("rejects malformed/tampered cart payload", async () => {
    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        items: [{ productId: "Royal-Blue", quantity: 1, unitAmount: 1 }],
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
      },
    });
  });

  it("rejects unknown product IDs", async () => {
    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        items: [{ productId: "does-not-exist", quantity: 1 }],
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "UNKNOWN_PRODUCT",
      },
    });
  });

  it("rejects sold out products", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        items: [{ productId: "Burgundy-Bridal-Dress", quantity: 1 }],
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "PRODUCT_SOLD_OUT",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supports pickup in store without requiring a shipping address", async () => {
    process.env.ENABLE_SHIPPING_CHARGES = "true";

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_pickup_1", href: "https://checkout.clover.com/pay/checkout_pickup_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        customer: {
          ...makeCheckoutBody().customer,
          deliveryMethod: "pickup",
          address: "",
          city: "",
          state: "",
          postalCode: "",
          country: "",
        },
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}")) as {
      shoppingCart?: { lineItems?: Array<{ name: string }> };
    };
    const lineItemNames = (fetchPayload.shoppingCart?.lineItems || []).map((item) => item.name);
    expect(lineItemNames).not.toContain("Shipping");
  });

  it("rejects invalid customer fields and quantity limits", async () => {
    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        customer: {
          ...makeCheckoutBody().customer,
          email: "not-an-email",
        },
        items: [{ productId: "Royal-Blue", quantity: 11 }],
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
      },
    });
  });

  it("rejects invalid discount codes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        discountCode: "NOTVALID",
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "INVALID_DISCOUNT_CODE",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies LAUNCH10 discount to checkout line items", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_launch10", href: "https://checkout.clover.com/pay/checkout_launch10" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        discountCode: "launch10",
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}")) as {
      shoppingCart?: { lineItems?: Array<{ name: string; price: number; unitQty: number }> };
    };
    const lineItems = fetchPayload.shoppingCart?.lineItems || [];
    const discountLine = lineItems.find((lineItem) => lineItem.name === "Discount (LAUNCH10)");
    const taxLine = lineItems.find((lineItem) => lineItem.name === "GST (5%)");

    expect(discountLine?.price).toBe(-5000);
    expect(discountLine?.unitQty).toBe(1);
    expect(taxLine?.price).toBe(2250);
  });

  it("uses trusted server pricing instead of client price", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_123", href: "https://checkout.clover.com/pay/checkout_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        items: [{ productId: "Royal-Blue", quantity: 2, unitAmount: 1 }],
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    const validRequest = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify(makeCheckoutBody()),
    });
    const validResponse = createMockResponse();
    await handler(validRequest, validResponse);

    expect(validResponse.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}")) as {
      shoppingCart?: { lineItems?: Array<{ price: number; unitQty: number }> };
    };
    expect(fetchPayload.shoppingCart?.lineItems?.[0]?.price).toBe(25000);
    expect(fetchPayload.shoppingCart?.lineItems?.[0]?.unitQty).toBe(2);
  });

  it("reuses existing checkout session for duplicate submissions (idempotency)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_abc", href: "https://checkout.clover.com/pay/checkout_abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = makeCheckoutBody();
    const headers = {
      origin: "https://www.riasboutique.com",
      "user-agent": "Mozilla/5.0",
    };

    const firstResponse = createMockResponse();
    await handler(
      createMockRequest({
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      firstResponse,
    );

    const secondResponse = createMockResponse();
    await handler(
      createMockRequest({
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      secondResponse,
    );

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondResponse.jsonBody).toMatchObject({
      reused: true,
    });
  });
});
