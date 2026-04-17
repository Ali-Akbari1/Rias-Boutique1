/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/clover-checkout";
import { createMockRequest, createMockResponse, createSignedShippingQuoteToken } from "./test-utils/utils";
import {
  closeOrderStoreForTests,
  createPendingOrder,
  resetOrderStoreForTests,
} from "../../server/lib/order-store.js";
import * as productCatalog from "../../server/lib/product-catalog";
import {
  resetDiscountSubscribersForTests,
  seedDiscountSubscriberForTests,
} from "../../server/lib/discount-subscribers.js";

const makeCheckoutBody = () => {
  const customer = {
    fullName: "Test Customer",
    email: "test@example.com",
    phone: "+1 (403) 555-0101",
    address: "123 Main St",
    city: "Calgary",
    state: "Alberta",
    postalCode: "T2X 1A1",
    country: "Canada",
  };
  const items = [{ productId: "Blue-Cheerma-Dozi", quantity: 1, selection: { size: "One Size", color: "Default" } }];

  return {
    customer,
    items,
    shippingQuote: {
      token: createSignedShippingQuoteToken({
        customer,
        items,
        subtotalMinor: 40_000,
        customerRateMinor: 0,
        quotedRateMinor: 1_800,
        freeShippingApplied: true,
      }),
    },
  };
};

describe("clover checkout endpoint", () => {
  let catalogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.restoreAllMocks();

    process.env.ORDER_STORE_ADAPTER = "memory";
    await closeOrderStoreForTests();
    process.env.CLOVER_MERCHANT_ID = "merchant_123";
    process.env.CLOVER_PRIVATE_TOKEN = "private_token_123";
    process.env.CLOVER_CHECKOUT_BASE_URL = "https://www.riasboutique.com";
    process.env.CLOVER_API_BASE_URL = "https://apisandbox.dev.clover.com";
    process.env.ENABLE_SHIPPING_CHARGES = "true";
    process.env.EASYPOST_QUOTE_SECRET = "test_shipping_quote_secret";
    process.env.EASYPOST_API_KEY = "ezak_test_123";
    process.env.EASYPOST_FROM_STREET1 = "260300 Writing Creek Cres Floor 1 Unit H31";
    process.env.EASYPOST_FROM_CITY = "Balzac";
    process.env.EASYPOST_FROM_STATE = "AB";
    process.env.EASYPOST_FROM_ZIP = "T4A 0X8";
    process.env.EASYPOST_FROM_COUNTRY = "CA";

    catalogSpy = vi.spyOn(productCatalog, "getCatalogMap").mockResolvedValue(
      new Map([
        [
          "Blue-Cheerma-Dozi",
          {
            id: "Blue-Cheerma-Dozi",
            name: "Blue Long Cheerma Dozi Dress",
            priceMinor: 40000,
            availability: "available",
          },
        ],
      ]),
    );

    await resetOrderStoreForTests();
    await resetDiscountSubscribersForTests();
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
        items: [
          { productId: "Royal-Blue", quantity: 1, unitAmount: 1, selection: { size: "One Size", color: "Default" } },
        ],
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
        items: [{ productId: "does-not-exist", quantity: 1, selection: { size: "One Size", color: "Default" } }],
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
    catalogSpy.mockResolvedValue(
      new Map([
        [
          "Burgundy-Bridal-Dress",
          {
            id: "Burgundy-Bridal-Dress",
            name: "Burgundy Bridal Dress",
            priceMinor: 100,
            availability: "sold_out",
          },
        ],
      ]),
    );

    const request = createMockRequest({
      method: "POST",
      headers: {
        origin: "https://www.riasboutique.com",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        ...makeCheckoutBody(),
        items: [{ productId: "Burgundy-Bridal-Dress", quantity: 1, selection: { size: "One Size", color: "Default" } }],
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
        items: [{ productId: "Blue-Cheerma-Dozi", quantity: 11, selection: { size: "One Size", color: "Default" } }],
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

  it("rejects welcome discount when the checkout email is not subscribed", async () => {
    process.env.WELCOME_DISCOUNT_EXPIRES_AT = "2099-01-01T00:00:00.000Z";
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
        discountCode: "WELCOME10",
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "DISCOUNT_CODE_NOT_ELIGIBLE",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects welcome discount when the checkout email already has an order", async () => {
    process.env.WELCOME_DISCOUNT_EXPIRES_AT = "2099-01-01T00:00:00.000Z";
    await seedDiscountSubscriberForTests({ email: "test@example.com" });
    await createPendingOrder({
      idempotencyKey: "existing-order-1234567890",
      customer: {
        deliveryMethod: "shipping",
        fullName: "Existing Customer",
        email: "test@example.com",
        phone: "+1 (403) 555-0111",
        address: "456 Other St",
        city: "Calgary",
        state: "Alberta",
        postalCode: "T2X 1A1",
        country: "Canada",
      },
      lineItems: [
        {
          productId: "Blue-Cheerma-Dozi",
          name: "Blue Long Cheerma Dozi Dress",
          unitAmountMinor: 40000,
          quantity: 1,
          lineTotalMinor: 40000,
          selection: {
            size: "One Size",
            color: "Default",
          },
        },
      ],
      subtotalMinor: 40000,
      totalMinor: 42000,
      pricing: {
        discountCode: "",
        discountMinor: 0,
        shippingMinor: 0,
        quotedShippingMinor: 1800,
        taxMinor: 2000,
        freeShippingApplied: true,
      },
    });

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
        discountCode: "WELCOME10",
      }),
    });
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(409);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "FIRST_ORDER_DISCOUNT_INELIGIBLE",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies WELCOME10 discount to checkout line items", async () => {
    process.env.WELCOME_DISCOUNT_EXPIRES_AT = "2099-01-01T00:00:00.000Z";
    await seedDiscountSubscriberForTests({ email: "test@example.com" });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_welcome10", href: "https://checkout.clover.com/pay/checkout_welcome10" }), {
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
        discountCode: "welcome10",
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
    const taxLine = lineItems.find((lineItem) => lineItem.name === "GST (5%)");
    const lineItemsTotal = lineItems.reduce((sum, lineItem) => sum + lineItem.price * lineItem.unitQty, 0);

    expect(lineItems.every((lineItem) => lineItem.price > 0)).toBe(true);
    expect(lineItems.some((lineItem) => lineItem.name.includes("Discount"))).toBe(false);
    expect(taxLine?.price).toBe(1800);
    expect(lineItemsTotal).toBe(37800);
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
        items: [
          { productId: "Blue-Cheerma-Dozi", quantity: 2, unitAmount: 1, selection: { size: "One Size", color: "Default" } },
        ],
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
    expect(fetchPayload.shoppingCart?.lineItems?.[0]?.price).toBe(40000);
    expect(fetchPayload.shoppingCart?.lineItems?.[0]?.unitQty).toBe(1);
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

  it("reuses an existing discounted checkout session for duplicate submissions", async () => {
    process.env.WELCOME_DISCOUNT_EXPIRES_AT = "2099-01-01T00:00:00.000Z";
    await seedDiscountSubscriberForTests({ email: "test@example.com" });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_discounted", href: "https://checkout.clover.com/pay/checkout_discounted" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = {
      ...makeCheckoutBody(),
      discountCode: "WELCOME10",
    };
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
