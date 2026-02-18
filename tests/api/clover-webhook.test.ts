/** @vitest-environment node */
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import checkoutHandler from "../../api/clover-checkout";
import webhookHandler from "../../api/clover-webhook";
import orderStatusHandler from "../../api/order-status";
import { createMockRequest, createMockResponse } from "./test-utils/utils";
import { closeOrderStoreForTests, resetOrderStoreForTests } from "../../server/lib/order-store.js";
const WEBHOOK_SECRET = "webhook_secret_test";

const buildCheckoutRequestBody = () => ({
  customer: {
    fullName: "Webhook Customer",
    email: "webhook@example.com",
    phone: "+1 (403) 555-0101",
    address: "123 Main St",
    city: "Calgary",
    state: "Alberta",
    postalCode: "T2X 1A1",
    country: "Canada",
  },
  items: [{ productId: "Royal-Blue", quantity: 1 }],
});

describe("clover webhook flow", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.ORDER_STORE_ADAPTER = "memory";
    await closeOrderStoreForTests();

    process.env.CLOVER_MERCHANT_ID = "merchant_123";
    process.env.CLOVER_PRIVATE_TOKEN = "private_token_123";
    process.env.CLOVER_CHECKOUT_BASE_URL = "https://www.riasboutique.com";
    process.env.CLOVER_API_BASE_URL = "https://apisandbox.dev.clover.com";
    process.env.CLOVER_WEBHOOK_SECRET = WEBHOOK_SECRET;

    await resetOrderStoreForTests();
  });

  it("marks order as paid and is idempotent", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_abc", href: "https://checkout.clover.com/pay/checkout_abc" }), {
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
        body: JSON.stringify(buildCheckoutRequestBody()),
      }),
      checkoutResponse,
    );

    expect(checkoutResponse.statusCode).toBe(200);
    const orderId = (checkoutResponse.jsonBody as { orderId?: string }).orderId || "";
    expect(orderId).toBeTruthy();

    const webhookPayload = {
      id: "evt_paid_1",
      type: "payment.succeeded",
      orderId,
      checkoutId: "checkout_abc",
      paymentId: "pay_123",
      status: "paid",
    };
    const rawBody = JSON.stringify(webhookPayload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");

    const webhookResponse = createMockResponse();
    await webhookHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-clover-signature": signature,
          "x-clover-timestamp": timestamp,
        },
        body: rawBody,
      }),
      webhookResponse,
    );

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.jsonBody).toMatchObject({
      processed: true,
      orderId,
    });

    const statusResponse = createMockResponse();
    await orderStatusHandler(
      createMockRequest({
        method: "GET",
        query: { orderId },
        headers: {},
      }),
      statusResponse,
    );

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.jsonBody).toMatchObject({
      confirmed: true,
      paymentStatus: "paid",
    });

    const duplicateWebhookResponse = createMockResponse();
    await webhookHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-clover-signature": signature,
          "x-clover-timestamp": timestamp,
        },
        body: rawBody,
      }),
      duplicateWebhookResponse,
    );

    expect(duplicateWebhookResponse.statusCode).toBe(200);
    expect(duplicateWebhookResponse.jsonBody).toMatchObject({
      duplicate: true,
    });
  });

  it("rejects invalid webhook signatures", async () => {
    const response = createMockResponse();
    await webhookHandler(
      createMockRequest({
        method: "POST",
        headers: {
          "x-clover-signature": "invalid",
          "x-clover-timestamp": String(Math.floor(Date.now() / 1000)),
        },
        body: JSON.stringify({ id: "evt_invalid", type: "payment.succeeded" }),
      }),
      response,
    );

    expect(response.statusCode).toBe(401);
    expect(response.jsonBody).toMatchObject({
      error: {
        code: "INVALID_SIGNATURE",
      },
    });
  });

  it("accepts signature headers that include timestamp inline (t=...,v1=...)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_inline_1", href: "https://checkout.clover.com/pay/checkout_inline_1" }), {
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
        body: JSON.stringify(buildCheckoutRequestBody()),
      }),
      checkoutResponse,
    );

    expect(checkoutResponse.statusCode).toBe(200);
    const orderId = (checkoutResponse.jsonBody as { orderId?: string }).orderId || "";
    expect(orderId).toBeTruthy();

    const webhookPayload = {
      id: "evt_paid_inline_1",
      type: "payment.succeeded",
      orderId,
      checkoutId: "checkout_inline_1",
      paymentId: "pay_inline_1",
      status: "paid",
    };
    const rawBody = JSON.stringify(webhookPayload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");

    const webhookResponse = createMockResponse();
    await webhookHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-clover-signature": `t=${timestamp},v1=${signature}`,
        },
        body: rawBody,
      }),
      webhookResponse,
    );

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.jsonBody).toMatchObject({
      processed: true,
      orderId,
    });
  });

  it("accepts raw-body signatures even when timestamp header is present", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_rawsig_1", href: "https://checkout.clover.com/pay/checkout_rawsig_1" }), {
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
        body: JSON.stringify(buildCheckoutRequestBody()),
      }),
      checkoutResponse,
    );

    expect(checkoutResponse.statusCode).toBe(200);
    const orderId = (checkoutResponse.jsonBody as { orderId?: string }).orderId || "";
    expect(orderId).toBeTruthy();

    const webhookPayload = {
      id: "evt_paid_rawsig_1",
      type: "payment.succeeded",
      orderId,
      checkoutId: "checkout_rawsig_1",
      paymentId: "pay_rawsig_1",
      status: "paid",
    };
    const rawBody = JSON.stringify(webhookPayload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

    const webhookResponse = createMockResponse();
    await webhookHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-clover-signature": signature,
          "x-clover-timestamp": timestamp,
        },
        body: rawBody,
      }),
      webhookResponse,
    );

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.jsonBody).toMatchObject({
      processed: true,
      orderId,
    });
  });

  it("accepts base64 signatures in v1 format", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_b64_1", href: "https://checkout.clover.com/pay/checkout_b64_1" }), {
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
        body: JSON.stringify(buildCheckoutRequestBody()),
      }),
      checkoutResponse,
    );

    expect(checkoutResponse.statusCode).toBe(200);
    const orderId = (checkoutResponse.jsonBody as { orderId?: string }).orderId || "";
    expect(orderId).toBeTruthy();

    const webhookPayload = {
      id: "evt_paid_b64_1",
      type: "payment.succeeded",
      orderId,
      checkoutId: "checkout_b64_1",
      paymentId: "pay_b64_1",
      status: "paid",
    };
    const rawBody = JSON.stringify(webhookPayload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signatureBase64 = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("base64");

    const webhookResponse = createMockResponse();
    await webhookHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-clover-signature": `t=${timestamp},v1=${signatureBase64}`,
        },
        body: rawBody,
      }),
      webhookResponse,
    );

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.jsonBody).toMatchObject({
      processed: true,
      orderId,
    });
  });

  it("records failed payments without marking order as paid", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_fail_1", href: "https://checkout.clover.com/pay/checkout_fail_1" }), {
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
        body: JSON.stringify(buildCheckoutRequestBody()),
      }),
      checkoutResponse,
    );

    expect(checkoutResponse.statusCode).toBe(200);
    const orderId = (checkoutResponse.jsonBody as { orderId?: string }).orderId || "";
    expect(orderId).toBeTruthy();
    const webhookPayload = {
      id: "evt_failed_1",
      type: "payment.failed",
      orderId,
      checkoutId: "checkout_fail_1",
      paymentId: "pay_failed_1",
      status: "unpaid",
    };
    const rawBody = JSON.stringify(webhookPayload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");

    const webhookResponse = createMockResponse();
    await webhookHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-clover-signature": signature,
          "x-clover-timestamp": timestamp,
        },
        body: rawBody,
      }),
      webhookResponse,
    );

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.jsonBody).toMatchObject({
      processed: true,
      orderId,
    });

    const statusResponse = createMockResponse();
    await orderStatusHandler(
      createMockRequest({
        method: "GET",
        query: { orderId },
        headers: {},
      }),
      statusResponse,
    );

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.jsonBody).toMatchObject({
      confirmed: false,
      pending: false,
      paymentStatus: "failed",
    });
  });

  it("treats generic Clover payment events as paid when identifiers are present", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "checkout_generic_1", href: "https://checkout.clover.com/pay/checkout_generic_1" }), {
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
        body: JSON.stringify(buildCheckoutRequestBody()),
      }),
      checkoutResponse,
    );

    expect(checkoutResponse.statusCode).toBe(200);
    const orderId = (checkoutResponse.jsonBody as { orderId?: string }).orderId || "";
    expect(orderId).toBeTruthy();

    const webhookPayload = {
      id: "evt_generic_payment_1",
      type: "payment",
      orderId,
      checkoutId: "checkout_generic_1",
      paymentId: "pay_generic_1",
    };
    const rawBody = JSON.stringify(webhookPayload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");

    const webhookResponse = createMockResponse();
    await webhookHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "x-clover-signature": signature,
          "x-clover-timestamp": timestamp,
        },
        body: rawBody,
      }),
      webhookResponse,
    );

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.jsonBody).toMatchObject({
      processed: true,
      orderId,
    });

    const statusResponse = createMockResponse();
    await orderStatusHandler(
      createMockRequest({
        method: "GET",
        query: { orderId },
        headers: {},
      }),
      statusResponse,
    );

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.jsonBody).toMatchObject({
      confirmed: true,
      paymentStatus: "paid",
    });
  });
});
