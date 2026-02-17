/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import handler from "./clover-checkout";
import { createMockRequest, createMockResponse } from "./test/utils";
import { closeOrderStoreForTests, resetOrderStoreForTests } from "./lib/order-store";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-commerce-checkout.sqlite");

const makeCheckoutBody = () => ({
  customer: {
    fullName: "Test Customer",
    email: "test@example.com",
    address: "123 Main St",
    city: "Calgary",
    state: "Alberta",
    postalCode: "T2X 1A1",
    country: "Canada",
  },
  items: [{ productId: "Royal-Blue", quantity: 2 }],
});

describe("clover checkout endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    closeOrderStoreForTests();
    rmSync(TEST_DB_PATH, { force: true });
    process.env.ORDER_DB_PATH = TEST_DB_PATH;
    process.env.CLOVER_MERCHANT_ID = "merchant_123";
    process.env.CLOVER_PRIVATE_TOKEN = "private_token_123";
    process.env.CLOVER_CHECKOUT_BASE_URL = "https://www.riasboutique.com";
    process.env.CLOVER_API_BASE_URL = "https://apisandbox.dev.clover.com";

    resetOrderStoreForTests();
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
