import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  getHeader,
  parseJsonBody,
  readRawBody,
  safeTimingCompare,
  sendError,
  type ApiRequest,
  type ApiResponse,
} from "../server/lib/http.js";
import {
  applyCorsResponseHeaders,
  buildAllowedOrigins,
  resolveAllowedOrigin,
} from "../server/lib/security.js";
import { loadCatalog } from "../server/lib/product-catalog.js";
import { sendOrderConfirmationEmail, sendTrackingEmail } from "../server/lib/email.js";
import { buildCarrierTrackingUrl } from "../server/lib/tracking.js";
import type { StoredOrder } from "../server/lib/order-store.js";

const isEmailTestEnabled = () => process.env.EMAIL_TEST_ENABLED?.trim().toLowerCase() === "true";
const isProductionEnv = () =>
  (process.env.VERCEL_ENV || process.env.NODE_ENV || "").trim().toLowerCase() === "production";

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

const testEmailSchema = z
  .object({
    type: z.enum(["confirmation", "tracking"]).optional(),
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

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
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
  applyCorsResponseHeaders(res, allowedOrigin, ["POST"]);

  if (!isEmailTestEnabled() || isProductionEnv()) {
    sendError(
      res,
      403,
      "EMAIL_TEST_DISABLED",
      "Email test endpoint is disabled. Set EMAIL_TEST_ENABLED=true in non-production environments.",
    );
    return;
  }

  const expectedToken =
    process.env.EMAIL_TEST_TOKEN?.trim() || process.env.ADMIN_DASHBOARD_TOKEN?.trim() || "";
  if (!expectedToken) {
    sendError(res, 500, "EMAIL_TEST_NOT_CONFIGURED", "Missing EMAIL_TEST_TOKEN or ADMIN_DASHBOARD_TOKEN.");
    return;
  }

  const providedToken = readAdminToken(req);
  if (!providedToken || !safeTimingCompare(providedToken, expectedToken)) {
    sendError(res, 401, "UNAUTHORIZED", "Unauthorized request.");
    return;
  }

  const rawBody = await readRawBody(req);
  const parsedBody = parseJsonBody<unknown>(rawBody);
  if (!parsedBody) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const validation = testEmailSchema.safeParse(parsedBody);
  if (!validation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Email test payload is invalid.", validation.error.flatten());
    return;
  }

  const payload = validation.data;
  const type = payload.type || "tracking";
  const recipient = payload.customerEmail?.trim() || process.env.EMAIL_TEST_RECIPIENT?.trim() || "";
  if (!recipient) {
    sendError(res, 400, "MISSING_RECIPIENT", "Set customerEmail or EMAIL_TEST_RECIPIENT.");
    return;
  }

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

  const order: StoredOrder = {
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
            trackingCode: payload.trackingCode?.trim() || `TEST-${Math.random().toString(36).slice(2, 10)}`,
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

  try {
    if (type === "confirmation") {
      await sendOrderConfirmationEmail(order);
    } else {
      await sendTrackingEmail(order);
    }

    res.status(200).json({
      ok: true,
      type,
      recipient,
      productId: product.id,
      orderId: order.id,
    });
  } catch (error) {
    sendError(
      res,
      502,
      "EMAIL_TEST_FAILED",
      error instanceof Error ? error.message : "Unable to send the test email.",
    );
  }
}
