/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import adminOrdersHandler from "../../api/admin-orders";
import checkoutHandler from "../../api/clover-checkout";
import { closeOrderStoreForTests, resetOrderStoreForTests } from "../../server/lib/order-store.js";
import { createMockRequest, createMockResponse } from "./test-utils/utils";

const ADMIN_TOKEN = "admin-token-for-tests";

const buildCheckoutBody = () => ({
  customer: {
    fullName: "Admin Orders Customer",
    email: "admin-orders@example.com",
    phone: "+1 (403) 555-0101",
    address: "123 Main St",
    city: "Calgary",
    state: "Alberta",
    postalCode: "T2X 1A1",
    country: "Canada",
  },
  items: [{ productId: "Royal-Blue", quantity: 1 }],
});

describe("admin orders endpoint", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.ORDER_STORE_ADAPTER = "memory";
    await closeOrderStoreForTests();
    process.env.CLOVER_MERCHANT_ID = "merchant_123";
    process.env.CLOVER_PRIVATE_TOKEN = "private_token_123";
    process.env.CLOVER_CHECKOUT_BASE_URL = "https://www.riasboutique.com";
    process.env.CLOVER_API_BASE_URL = "https://apisandbox.dev.clover.com";
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
