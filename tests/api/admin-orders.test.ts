/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import adminOrdersHandler from "../../api/admin-orders";
import {
  closeOrderStoreForTests,
  createPendingOrder,
  listOrders,
  markOrderPaidAndDecrementInventory,
  resetOrderStoreForTests,
  saveOrderShipment,
} from "../../server/lib/order-store.js";
import { createDeterministicHash } from "../../server/lib/http.js";
import { createMockRequest, createMockResponse } from "./test-utils/utils";

const ADMIN_TOKEN = "admin-token-for-tests";

const buildPendingOrderInput = () => {
  const customer = {
    deliveryMethod: "shipping" as const,
    fullName: "Admin Orders Customer",
    email: "admin-orders@example.com",
    phone: "+1 (403) 555-0101",
    address: "123 Main St",
    city: "Calgary",
    state: "Alberta",
    postalCode: "T2X 1A1",
    country: "Canada",
  };
  const items = [
    {
      productId: "Blue-Cheerma-Dozi",
      name: "Blue Cheerma Dozi",
      unitAmountMinor: 40_000,
      quantity: 1,
      lineTotalMinor: 40_000,
    },
  ];

  return {
    customer,
    lineItems: items,
    shippingQuote: {
      provider: "easypost" as const,
      shipmentId: "shp_test_123",
      rateId: "rate_test_123",
      carrier: "Canada Post",
      service: "Expedited Parcel",
      quotedRateMinor: 1_800,
      customerRateMinor: 1_800,
      currency: "CAD",
      deliveryDays: 4,
      deliveryDate: "",
      freeShippingApplied: false,
      selectedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      contextHash: createDeterministicHash("admin-orders-test-context"),
      tokenHash: createDeterministicHash("admin-orders-test-token"),
    },
    subtotalMinor: 40_000,
    totalMinor: 41_800,
    pricing: {
      discountCode: "",
      discountMinor: 0,
      shippingMinor: 1_800,
      quotedShippingMinor: 1_800,
      taxMinor: 0,
      freeShippingApplied: false,
    },
    idempotencyKey: "admin-orders-test-idempotency-key",
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
    await createPendingOrder(buildPendingOrderInput());

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

  it("retries shipping label purchase for paid shipping orders", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/shipments/shp_test_123/buy")) {
        return new Response(
          JSON.stringify({
            tracking_code: "CP123456789CA",
            tracker: {
              tracking_code: "CP123456789CA",
              public_url: "https://track.easypost.com/CP123456789CA",
            },
            postage_label: {
              label_url: "https://example.com/label.png",
              label_pdf_url: "https://example.com/label.pdf",
            },
            status: "purchased",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          id: "checkout_admin_1",
          href: "https://checkout.clover.com/pay/checkout_admin_1",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await createPendingOrder({
      ...buildPendingOrderInput(),
      idempotencyKey: "admin-orders-retry-idempotency-key",
    });

    const [order] = await listOrders();
    expect(order).toBeTruthy();
    expect(order?.shipment).toBeNull();

    await markOrderPaidAndDecrementInventory({
      orderId: order.id,
      paymentReference: "pay_retry_test_123",
    });

    const retryResponse = createMockResponse();
    await adminOrdersHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-admin-token": ADMIN_TOKEN,
        },
        body: JSON.stringify({
          action: "retry_label_purchase",
          orderId: order.id,
        }),
      }),
      retryResponse,
    );

    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.jsonBody).toMatchObject({
      message: "Shipping label purchased successfully.",
      order: {
        id: order.id,
        shipment: {
          trackingCode: "CP123456789CA",
          trackingUrl: "https://track.easypost.com/CP123456789CA",
          labelPdfUrl: "https://example.com/label.pdf",
        },
      },
    });
  });

  it("requests a shipping label refund for purchased labels", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/shipments/shp_refund_test_123/refund")) {
        return new Response(
          JSON.stringify({
            id: "shp_refund_test_123",
            status: "pre_transit",
            refund_status: "submitted",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const createdOrder = await createPendingOrder({
      ...buildPendingOrderInput(),
      idempotencyKey: "admin-orders-refund-idempotency-key",
    });

    await markOrderPaidAndDecrementInventory({
      orderId: createdOrder.id,
      paymentReference: "pay_refund_test_123",
    });

    await saveOrderShipment({
      orderId: createdOrder.id,
      shipment: {
        provider: "easypost",
        shipmentId: "shp_refund_test_123",
        rateId: "rate_refund_test_123",
        carrier: "Canada Post",
        service: "Expedited Parcel",
        quotedRateMinor: 1_800,
        customerRateMinor: 1_800,
        currency: "CAD",
        trackingCode: "CPREFUND123CA",
        trackingUrl: "https://track.easypost.com/CPREFUND123CA",
        labelUrl: "https://example.com/refund-label.png",
        labelPdfUrl: "https://example.com/refund-label.pdf",
        trackingQrCodeDataUrl: "data:image/png;base64,tracking",
        labelQrCodeDataUrl: "data:image/png;base64,label",
        status: "purchased",
        purchasedAt: new Date().toISOString(),
      },
    });

    const refundResponse = createMockResponse();
    await adminOrdersHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-admin-token": ADMIN_TOKEN,
        },
        body: JSON.stringify({
          action: "refund_label",
          orderId: createdOrder.id,
        }),
      }),
      refundResponse,
    );

    expect(refundResponse.statusCode).toBe(200);
    expect(refundResponse.jsonBody).toMatchObject({
      message: "Label refund requested successfully.",
      order: {
        id: createdOrder.id,
        shipment: {
          shipmentId: "shp_refund_test_123",
          status: "refund_submitted",
        },
      },
    });
  });
});
