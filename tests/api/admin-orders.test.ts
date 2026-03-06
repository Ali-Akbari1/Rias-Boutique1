/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import adminOrdersHandler from "../../api/admin-orders";
import checkoutHandler from "../../api/clover-checkout";
import { closeOrderStoreForTests, resetOrderStoreForTests } from "../../server/lib/order-store.js";
import { createMockRequest, createMockResponse, createSignedShippingQuoteToken } from "./test-utils/utils";

const ADMIN_TOKEN = "admin-token-for-tests";

const buildCheckoutBody = () => {
  const customer = {
    fullName: "Admin Orders Customer",
    email: "admin-orders@example.com",
    phone: "+1 (403) 555-0101",
    address: "123 Main St",
    city: "Calgary",
    state: "Alberta",
    postalCode: "T2X 1A1",
    country: "Canada",
  };
  const items = [{ productId: "Blue-Cheerma-Dozi", quantity: 1 }];

  return {
    customer,
    items,
    shippingQuote: {
      token: createSignedShippingQuoteToken({
        customer,
        items,
        subtotalMinor: 40_000,
        customerRateMinor: 1_800,
        quotedRateMinor: 1_800,
      }),
    },
  };
};

describe("admin orders endpoint", () => {
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
    process.env.ADMIN_DASHBOARD_TOKEN = ADMIN_TOKEN;
    await resetOrderStoreForTests();
  });

  it("rejects requests without a valid admin token", async () => {
    const response = createMockResponse();
    await adminOrdersHandler(
      createMockRequest({
        method: "GET",
        headers: {
          origin: "https://www.riasboutique.com",
        },
      }),
      response,
    );

    expect(response.statusCode).toBe(401);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "UNAUTHORIZED",
      },
    });
  });

  it("returns orders with customer shipping details", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_admin_1", href: "https://checkout.clover.com/pay/checkout_admin_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const checkoutResponse = createMockResponse();
    await checkoutHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify(buildCheckoutBody()),
      }),
      checkoutResponse,
    );

    expect(checkoutResponse.statusCode).toBe(200);

    const adminResponse = createMockResponse();
    await adminOrdersHandler(
      createMockRequest({
        method: "GET",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-admin-token": ADMIN_TOKEN,
        },
      }),
      adminResponse,
    );

    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.jsonBody).toMatchObject({
      count: 1,
      orders: [
        {
          customer: {
            email: "admin-orders@example.com",
            phone: "+1 (403) 555-0101",
            country: "Canada",
          },
          paymentStatus: "pending",
        },
      ],
    });
  });
});
