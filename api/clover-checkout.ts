import {
  parseJsonBody,
  readRawBody,
  sendError,
  type ApiRequest,
  type ApiResponse,
} from "../server/lib/http.js";
import { checkRateLimit, applyRateLimitHeaders } from "../server/lib/rate-limit.js";
import {
  buildAllowedOrigins,
  buildCheckoutIdempotencyKey,
  canonicalizeCartItems,
  getClientIp,
  looksAutomatedTraffic,
  validateOrigin,
  verifyCartToken,
} from "../server/lib/security.js";
import { checkoutRequestSchema } from "../server/lib/checkout-schema.js";
import { getCatalogMap, loadCatalog } from "../server/lib/product-catalog.js";
import {
  attachCheckoutSession,
  createPendingOrder,
  findOrderByIdempotencyKey,
  isOrderStoreConfigured,
  markOrderFailed,
  seedInventoryFromCatalog,
  type OrderLineItem,
} from "../server/lib/order-store.js";
import { createCloverCheckoutSession } from "../server/lib/clover.js";

const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_RATE_WINDOW_MS = 60_000;

const getCheckoutBaseUrl = () => process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "";

const validateServerConfiguration = () => {
  const merchantId = process.env.CLOVER_MERCHANT_ID?.trim() || "";
  const privateToken = process.env.CLOVER_PRIVATE_TOKEN?.trim() || "";
  const checkoutBaseUrl = getCheckoutBaseUrl();
  const apiBaseUrl = (process.env.CLOVER_API_BASE_URL?.trim() || "https://apisandbox.dev.clover.com").replace(
    /\/+$/,
    "",
  );

  if (!merchantId || !privateToken) {
    return {
      ok: false as const,
      error: "Checkout is not available right now. Please try again later.",
      details: "Missing CLOVER_MERCHANT_ID or CLOVER_PRIVATE_TOKEN.",
    };
  }

  if (!checkoutBaseUrl || !checkoutBaseUrl.toLowerCase().startsWith("https://")) {
    return {
      ok: false as const,
      error: "Checkout is not available right now. Please contact support.",
      details: "CLOVER_CHECKOUT_BASE_URL must be configured with HTTPS.",
    };
  }

  return {
    ok: true as const,
    merchantId,
    privateToken,
    checkoutBaseUrl: checkoutBaseUrl.replace(/\/+$/, ""),
    apiBaseUrl,
    pageConfigUuid: process.env.CLOVER_PAGE_CONFIG_UUID?.trim() || "",
    enableTips: process.env.CLOVER_ENABLE_TIPS?.trim().toLowerCase() === "true",
  };
};

const toShippingFingerprint = (customer: {
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}) =>
  [customer.address || "", customer.city || "", customer.state || "", customer.postalCode || "", customer.country || ""]
    .map((part) => part.trim().toLowerCase())
    .join("|");

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const allowedOrigins = buildAllowedOrigins(
    getCheckoutBaseUrl(),
    process.env.ALLOWED_CHECKOUT_ORIGINS?.trim() || "",
  );
  if (!validateOrigin(req, allowedOrigins)) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }

  const clientIp = getClientIp(req);
  const rateResult = checkRateLimit({
    key: `checkout:${clientIp}`,
    limit: Number(process.env.CHECKOUT_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.CHECKOUT_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many checkout attempts. Please try again shortly.");
    return;
  }

  const rawBody = await readRawBody(req);
  const parsedBody = parseJsonBody<unknown>(rawBody);
  if (!parsedBody) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const bodyResult = checkoutRequestSchema.safeParse(parsedBody);
  if (!bodyResult.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Some checkout fields are invalid.", bodyResult.error.flatten());
    return;
  }

  const payload = bodyResult.data;
  if ((payload.promoCode || "").trim()) {
    sendError(res, 400, "PROMO_NOT_SUPPORTED", "Promo codes are not supported for this checkout.");
    return;
  }

  if (looksAutomatedTraffic(req)) {
    sendError(res, 403, "BOT_DETECTED", "Automated checkout attempts are not allowed.");
    return;
  }

  const config = validateServerConfiguration();
  if (!config.ok) {
    sendError(res, 500, "CHECKOUT_NOT_CONFIGURED", config.error, config.details);
    return;
  }

  if (!isOrderStoreConfigured()) {
    sendError(
      res,
      500,
      "CHECKOUT_NOT_CONFIGURED",
      "Checkout is not available right now. Please contact support.",
      "Supabase order store is not configured.",
    );
    return;
  }

  const cartCanonical = canonicalizeCartItems(payload.items);
  if (!cartCanonical) {
    sendError(res, 400, "EMPTY_CART", "Your cart is empty.");
    return;
  }

  const cartTokenSecret = process.env.CART_TOKEN_SECRET?.trim() || "";
  if (cartTokenSecret) {
    const tokenValid = verifyCartToken({
      secret: cartTokenSecret,
      canonicalCart: cartCanonical,
      timestamp: payload.cartTimestamp || 0,
      token: payload.cartToken || "",
      maxAgeMs: Number(process.env.CART_TOKEN_MAX_AGE_MS || 10 * 60 * 1000),
    });

    if (!tokenValid) {
      sendError(res, 403, "INVALID_CART_TOKEN", "Your checkout session has expired. Please refresh and try again.");
      return;
    }
  }

  const catalog = await loadCatalog();
  await seedInventoryFromCatalog(catalog);
  const catalogMap = await getCatalogMap();

  const lineItems: OrderLineItem[] = [];
  for (const requestedItem of payload.items) {
    const product = catalogMap.get(requestedItem.productId);
    if (!product) {
      sendError(res, 400, "UNKNOWN_PRODUCT", `Product ${requestedItem.productId} is no longer available.`);
      return;
    }

    lineItems.push({
      productId: product.id,
      name: product.name,
      unitAmountMinor: product.priceMinor,
      quantity: requestedItem.quantity,
      lineTotalMinor: product.priceMinor * requestedItem.quantity,
    });
  }

  const subtotalMinor = lineItems.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const totalMinor = subtotalMinor;

  const shippingFingerprint = toShippingFingerprint(payload.customer);
  const idempotencyKey =
    payload.idempotencyKey ||
    buildCheckoutIdempotencyKey({
      email: payload.customer.email,
      cartCanonical,
      shippingFingerprint,
    });

  const existingOrder = await findOrderByIdempotencyKey(idempotencyKey);
  if (existingOrder?.cloverCheckoutUrl && existingOrder.paymentStatus === "pending") {
    res.status(200).json({
      checkoutUrl: existingOrder.cloverCheckoutUrl,
      orderId: existingOrder.id,
      reused: true,
    });
    return;
  }

  if (existingOrder?.paymentStatus === "paid") {
    sendError(res, 409, "ORDER_ALREADY_PAID", "This order has already been paid.");
    return;
  }

  const order =
    existingOrder ||
    await createPendingOrder({
      idempotencyKey,
      customer: {
        fullName: payload.customer.fullName,
        email: payload.customer.email,
        phone: payload.customer.phone || "",
        address: payload.customer.address,
        city: payload.customer.city,
        state: payload.customer.state,
        postalCode: payload.customer.postalCode,
        country: payload.customer.country,
      },
      lineItems,
      subtotalMinor,
      totalMinor,
    });

  try {
    const session = await createCloverCheckoutSession({
      apiBaseUrl: config.apiBaseUrl,
      merchantId: config.merchantId,
      privateToken: config.privateToken,
      pageConfigUuid: config.pageConfigUuid,
      enableTips: config.enableTips,
      orderReferenceId: order.id,
      customer: {
        fullName: payload.customer.fullName,
        email: payload.customer.email,
      },
      lineItems: lineItems.map((item) => ({
        name: item.name,
        price: item.unitAmountMinor,
        unitQty: item.quantity,
      })),
      successUrl: `${config.checkoutBaseUrl}/checkout/success?orderId=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`,
      failureUrl: `${config.checkoutBaseUrl}/checkout/cancel?orderId=${encodeURIComponent(order.id)}&error_code={ERROR_CODE}`,
      timeoutMs: Number(process.env.CLOVER_TIMEOUT_MS || 12_000),
    });

    await attachCheckoutSession({
      orderId: order.id,
      checkoutUrl: session.checkoutUrl,
      checkoutId: session.checkoutId,
    });

    res.status(200).json({
      checkoutUrl: session.checkoutUrl,
      orderId: order.id,
      reused: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start checkout right now. Please try again in a moment.";
    try {
      await markOrderFailed({ orderId: order.id, errorMessage: message });
    } catch (storeError) {
      console.error("[checkout] failed to persist order failure", storeError);
    }
    sendError(res, 502, "CHECKOUT_PROVIDER_ERROR", message);
  }
}
