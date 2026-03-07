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
import { ensureShipmentForOrder } from "../server/lib/order-fulfillment.js";
import { refundShippingLabel } from "../server/lib/easypost.js";
import { findOrderById, isOrderStoreConfigured, listOrders, saveOrderShipment } from "../server/lib/order-store.js";
import { z } from "zod";

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;

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

const adminShipmentActionSchema = z.discriminatedUnion("action", [retryLabelPurchaseSchema, refundLabelSchema]);

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

  const order = await findOrderById(validation.data.orderId);
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

  if (validation.data.action === "retry_label_purchase") {
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
