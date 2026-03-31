import { randomUUID } from "node:crypto";
import {
  getHeader,
  parseJsonBody,
  readRawBody,
  safeTimingCompare,
  sendError,
  type ApiRequest,
  type ApiResponse,
} from "../server/lib/http.js";
import { logger } from "../server/lib/logger.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import {
  applyCorsResponseHeaders,
  buildAllowedOrigins,
  getClientIp,
  resolveAllowedOrigin,
} from "../server/lib/security.js";
import { sendOrderConfirmationEmail, sendTrackingEmail } from "../server/lib/email.js";
import { ensureShipmentForOrder } from "../server/lib/order-fulfillment.js";
import { refundShippingLabel } from "../server/lib/easypost.js";
import {
  findOrderById,
  isOrderStoreConfigured,
  listOrders,
  saveOrderShipment,
  type StoredOrder,
} from "../server/lib/order-store.js";
import { buildCarrierTrackingUrl } from "../server/lib/tracking.js";
import { loadCatalog } from "../server/lib/product-catalog.js";
import { z } from "zod";

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const isEmailTestEnabled = () => process.env.EMAIL_TEST_ENABLED?.trim().toLowerCase() === "true";
const allowEmailTestInProd = () => process.env.EMAIL_TEST_ALLOW_PROD?.trim().toLowerCase() === "true";
const isProductionEnv = () =>
  (process.env.VERCEL_ENV || process.env.NODE_ENV || "").trim().toLowerCase() === "production";

const retryLabelPurchaseSchema = z
  .object({
    action: z.literal("retry_label_purchase"),
    orderId: z.string().trim().min(1).max(128),
  })
  .strict();

const refundLabelSchema = z
  .object({
    action: z.literal("refund_label"),
    orderId: z.string().trim().min(1).max(128),
  })
  .strict();

const sendTrackingEmailSchema = z
  .object({
    action: z.literal("send_tracking_email"),
    orderId: z.string().trim().min(1).max(128),
  })
  .strict();

const sendTestEmailSchema = z
  .object({
    action: z.literal("send_test_email"),
    type: z.enum(["confirmation", "tracking"]).optional(),
    orderId: z.string().trim().min(1).max(128).optional(),
    customerEmail: z.string().trim().email().optional(),
    customerName: z.string().trim().min(1).max(120).optional(),
    productId: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().int().min(1).max(5).optional(),
    trackingCode: z.string().trim().max(160).optional(),
    trackingUrl: z.string().trim().max(512).optional(),
    carrier: z.string().trim().max(80).optional(),
    service: z.string().trim().max(80).optional(),
  })
  .strict();

const manualTrackingSchema = z
  .object({
    action: z.literal("update_tracking_manual"),
    orderId: z.string().trim().min(1).max(128),
    trackingCode: z.string().trim().max(160).optional().or(z.literal("")),
    trackingUrl: z.string().trim().max(512).optional().or(z.literal("")),
    carrier: z.string().trim().max(80).optional().or(z.literal("")),
    service: z.string().trim().max(80).optional().or(z.literal("")),
  })
  .strict();

const adminShipmentActionSchema = z.discriminatedUnion("action", [
  retryLabelPurchaseSchema,
  refundLabelSchema,
  sendTrackingEmailSchema,
  sendTestEmailSchema,
  manualTrackingSchema,
]);

type AdminShipmentAction = z.infer<typeof adminShipmentActionSchema>;
type SendTestEmailAction = z.infer<typeof sendTestEmailSchema>;

const isSendTestEmailAction = (value: AdminShipmentAction): value is SendTestEmailAction =>
  value.action === "send_test_email";

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveBaseUrl = () => process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "https://www.riasboutique.com";
const resolveImageUrl = (image: string | undefined, baseUrl: string) => {
  const trimmed = (image || "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
};

const readAdminToken = (req: ApiRequest) => {
  const directHeader = (getHeader(req, "x-admin-token") || "").trim();
  if (directHeader) {
    return directHeader;
  }

  const authorizationHeader = (getHeader(req, "authorization") || "").trim();
  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  return "";
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const allowedOrigins = buildAllowedOrigins(
    process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "",
    process.env.ALLOWED_CHECKOUT_ORIGINS?.trim() || "",
  );
  const allowedOrigin = resolveAllowedOrigin(req, allowedOrigins, { allowMissingOrigin: false });
  if (!allowedOrigin) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }
  applyCorsResponseHeaders(res, allowedOrigin, ["GET", "POST"]);

  const rateResult = await checkRateLimit({
    key: `admin-orders:${getClientIp(req)}`,
    limit: Number(process.env.ADMIN_ORDERS_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.ADMIN_ORDERS_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many admin requests.");
    return;
  }

  if (!isOrderStoreConfigured()) {
    sendError(res, 500, "ADMIN_ORDERS_NOT_CONFIGURED", "Order store is not configured.");
    return;
  }

  const expectedToken = (process.env.ADMIN_DASHBOARD_TOKEN || "").trim();
  if (!expectedToken) {
    sendError(res, 500, "ADMIN_AUTH_NOT_CONFIGURED", "Admin dashboard token is not configured.");
    return;
  }

  const providedToken = readAdminToken(req);
  if (!providedToken || !safeTimingCompare(providedToken, expectedToken)) {
    sendError(res, 401, "UNAUTHORIZED", "Unauthorized request.");
    return;
  }

  if (req.method === "GET") {
    const orders = await listOrders();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      orders,
      count: orders.length,
    });
    return;
  }

  const rawBody = await readRawBody(req);
  const parsedBody = parseJsonBody<unknown>(rawBody);
  if (!parsedBody) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const validation = adminShipmentActionSchema.safeParse(parsedBody);
  if (!validation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Shipment action request is invalid.", validation.error.flatten());
    return;
  }

  const actionData = validation.data;

  if (isSendTestEmailAction(actionData)) {
    const payload = actionData;

    if (!isEmailTestEnabled() || (isProductionEnv() && !allowEmailTestInProd())) {
      sendError(
        res,
        403,
        "EMAIL_TEST_DISABLED",
        "Email test endpoint is disabled. Set EMAIL_TEST_ENABLED=true and EMAIL_TEST_ALLOW_PROD=true to allow in production.",
      );
      return;
    }

    const type = payload.type || "tracking";
    const recipient = payload.customerEmail?.trim() || process.env.EMAIL_TEST_RECIPIENT?.trim() || "";
    if (!recipient) {
      sendError(res, 400, "MISSING_RECIPIENT", "Set customerEmail or EMAIL_TEST_RECIPIENT.");
      return;
    }

    let order: StoredOrder | null = null;

    if (payload.orderId) {
      order = await findOrderById(payload.orderId);
      if (!order) {
        sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
        return;
      }
    }

    if (!order) {
      const catalog = await loadCatalog();
      if (catalog.length === 0) {
        sendError(res, 500, "CATALOG_EMPTY", "Product catalog is empty.");
        return;
      }

      const product =
        (payload.productId && catalog.find((entry) => entry.id === payload.productId)) ||
        catalog.find((entry) => entry.availability === "available") ||
        catalog[0];
      if (!product) {
        sendError(res, 404, "PRODUCT_NOT_FOUND", "Requested product was not found.");
        return;
      }

      const quantity = payload.quantity ?? 1;
      const unitAmountMinor = product.priceMinor;
      const lineTotalMinor = unitAmountMinor * quantity;
      const subtotalMinor = lineTotalMinor;
      const shippingMinor = Math.round(toNumber(process.env.FLAT_SHIPPING_RATE_MINOR, 3000));
      const discountMinor = 0;
      const taxRate = toNumber(process.env.CHECKOUT_TAX_RATE, 0.05);
      const taxMinor = Math.round((subtotalMinor - discountMinor + shippingMinor) * taxRate);
      const totalMinor = subtotalMinor - discountMinor + shippingMinor + taxMinor;
      const now = new Date().toISOString();
      const baseUrl = resolveBaseUrl();
      const imageUrl = resolveImageUrl(product.image, baseUrl) || undefined;

      order = {
        id: randomUUID(),
        paymentStatus: "paid",
        idempotencyKey: `test-${randomUUID()}`,
        cloverCheckoutId: "",
        cloverCheckoutUrl: "",
        paymentReference: "test-payment",
        currency: "CAD",
        subtotalMinor,
        totalMinor,
        pricing: {
          discountCode: "",
          discountMinor,
          shippingMinor,
          quotedShippingMinor: shippingMinor,
          taxMinor,
          freeShippingApplied: false,
        },
        customer: {
          deliveryMethod: "shipping",
          fullName: payload.customerName?.trim() || "Test Customer",
          email: recipient,
          phone: "403-555-0100",
          address: "123 9 Ave SE",
          city: "Calgary",
          state: "AB",
          postalCode: "T2G 0P6",
          country: "Canada",
        },
        lineItems: [
          {
            productId: product.id,
            name: product.name,
            imageUrl,
            unitAmountMinor,
            quantity,
            lineTotalMinor,
          },
        ],
        shippingQuote: null,
        shipment:
          type === "tracking"
            ? {
                provider: "manual",
                carrier: payload.carrier?.trim() || "Canada Post",
                service: payload.service?.trim() || "Standard",
                trackingCode:
                  payload.trackingCode?.trim() || `TEST-${Math.random().toString(36).slice(2, 10)}`,
                trackingUrl:
                  payload.trackingUrl?.trim() ||
                  buildCarrierTrackingUrl({
                    carrier: payload.carrier?.trim() || "Canada Post",
                    trackingCode: payload.trackingCode?.trim() || "TEST",
                  }),
                status: "pre_transit",
                purchasedAt: now,
              }
            : null,
        createdAt: now,
        updatedAt: now,
        paidAt: now,
        confirmationEmailSentAt: "",
        lastError: "",
      };
    }

    const orderToSend: StoredOrder = {
      ...order,
      customer: {
        ...order.customer,
        email: recipient,
        fullName: payload.customerName?.trim() || order.customer.fullName,
      },
    };

    if (
      type === "tracking" &&
      (!orderToSend.shipment || (!orderToSend.shipment.trackingCode && !orderToSend.shipment.trackingUrl))
    ) {
      sendError(res, 409, "TRACKING_NOT_READY", "Tracking information is not available yet.");
      return;
    }

    try {
      if (type === "confirmation") {
        await sendOrderConfirmationEmail(orderToSend);
      } else {
        await sendTrackingEmail(orderToSend);
      }

      res.status(200).json({
        ok: true,
        type,
        recipient,
        productId: orderToSend.lineItems[0]?.productId || "",
        orderId: orderToSend.id,
      });
    } catch (error) {
      logger.error("admin-orders.email_test_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      sendError(
        res,
        502,
        "EMAIL_TEST_FAILED",
        error instanceof Error ? error.message : "Unable to send the test email.",
      );
    }
    return;
  }

  const orderId = actionData.orderId;
  if (!orderId) {
    sendError(res, 400, "MISSING_ORDER_ID", "Order id is required.");
    return;
  }

  const order = await findOrderById(orderId);
  if (!order) {
    sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
    return;
  }

  if (order.customer.deliveryMethod !== "shipping") {
    sendError(res, 409, "SHIPMENT_NOT_REQUIRED", "Pickup orders do not require a shipping label.");
    return;
  }

  if (order.paymentStatus !== "paid") {
    sendError(res, 409, "ORDER_NOT_PAID", "Shipping labels can only be purchased after payment is confirmed.");
    return;
  }

  if (actionData.action === "send_tracking_email") {
    if (!order.shipment || (!order.shipment.trackingCode && !order.shipment.trackingUrl)) {
      sendError(res, 409, "TRACKING_NOT_READY", "Tracking information is not available yet for this order.");
      return;
    }

    try {
      const dispatch = await sendTrackingEmail(order);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        order,
        message: dispatch.status === "queued" ? "Tracking email queued successfully." : "Tracking email sent successfully.",
      });
    } catch (error) {
      logger.error("admin-orders.tracking_email_failed", {
        orderId: order.id,
        error: error instanceof Error ? error.message : String(error),
      });
      sendError(
        res,
        502,
        "TRACKING_EMAIL_FAILED",
        error instanceof Error ? error.message : "Unable to send the tracking email right now.",
      );
    }
    return;
  }


  if (actionData.action === "update_tracking_manual") {
    if (order.shipment?.provider === "easypost") {
      sendError(res, 409, "SHIPMENT_ALREADY_PURCHASED", "This order already has a purchased shipping label.");
      return;
    }

    const trackingCode = (actionData.trackingCode || "").trim();
    const trackingUrl = (actionData.trackingUrl || "").trim();
    const carrier = (actionData.carrier || "").trim();
    const service = (actionData.service || "").trim();
    const generatedTrackingUrl = !trackingUrl
      ? buildCarrierTrackingUrl({ carrier, trackingCode })
      : "";
    const resolvedTrackingUrl = trackingUrl || generatedTrackingUrl;

    if (!trackingCode && !trackingUrl) {
      sendError(res, 400, "TRACKING_REQUIRED", "Tracking number or tracking link is required.");
      return;
    }

    try {
      const updatedOrder = await saveOrderShipment({
        orderId: order.id,
        shipment: {
          provider: "manual",
          carrier: carrier || undefined,
          service: service || undefined,
          trackingCode: trackingCode || undefined,
          trackingUrl: resolvedTrackingUrl || undefined,
          status: "manual",
          purchasedAt: new Date().toISOString(),
        },
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        order: updatedOrder,
        message: "Manual tracking details saved.",
      });
    } catch (error) {
      logger.error("admin-orders.manual_tracking_failed", {
        orderId: order.id,
        error: error instanceof Error ? error.message : String(error),
      });
      sendError(
        res,
        502,
        "TRACKING_SAVE_FAILED",
        error instanceof Error ? error.message : "Unable to save tracking details right now.",
      );
    }
    return;
  }

  if (actionData.action === "retry_label_purchase") {
    if (order.shippingQuote?.provider !== "easypost") {
      sendError(
        res,
        409,
        "LABEL_PURCHASE_DISABLED",
        "EasyPost label purchasing is disabled for flat-rate shipping orders.",
      );
      return;
    }

    if (order.shipment) {
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        order,
        message: "Shipping label already purchased for this order.",
      });
      return;
    }

    try {
      const updatedOrder = await ensureShipmentForOrder(order);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        order: updatedOrder,
        message: "Shipping label purchased successfully.",
      });
    } catch (error) {
      logger.error("admin-orders.retry_label_purchase_failed", {
        orderId: order.id,
        error: error instanceof Error ? error.message : String(error),
      });
      sendError(
        res,
        502,
        "SHIPMENT_PURCHASE_FAILED",
        error instanceof Error ? error.message : "Unable to purchase a shipping label right now.",
      );
    }
    return;
  }

  if (!order.shipment) {
    sendError(res, 409, "SHIPMENT_NOT_PURCHASED", "This order does not have a purchased shipping label yet.");
    return;
  }

  if (order.shipment.provider !== "easypost" || !order.shipment.shipmentId) {
    sendError(res, 409, "SHIPMENT_NOT_REFUNDABLE", "This order does not have a refundable shipping label.");
    return;
  }

  if (order.shipment.status?.startsWith("refund_")) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      order,
      message: "Label refund already requested for this order.",
    });
    return;
  }

  try {
    const refund = await refundShippingLabel(order.shipment.shipmentId);
    const updatedOrder = await saveOrderShipment({
      orderId: order.id,
      shipment: {
        ...order.shipment,
        status: `refund_${refund.refundStatus}`,
      },
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      order: updatedOrder,
      message: "Label refund requested successfully.",
    });
  } catch (error) {
    logger.error("admin-orders.refund_label_failed", {
      orderId: order.id,
      shipmentId: order.shipment.shipmentId,
      error: error instanceof Error ? error.message : String(error),
    });
    sendError(
      res,
      502,
      "SHIPMENT_REFUND_FAILED",
      error instanceof Error ? error.message : "Unable to request a shipping label refund right now.",
    );
  }
}
