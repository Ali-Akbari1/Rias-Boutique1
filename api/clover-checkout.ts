import {
  createDeterministicHash,
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
import { getCatalogMap } from "../server/lib/product-catalog.js";
import {
  attachCheckoutSession,
  createPendingOrder,
  findOrderByIdempotencyKey,
  isOrderStoreConfigured,
  markOrderFailed,
  type OrderLineItem,
} from "../server/lib/order-store.js";
import { CloverApiError, createCloverCheckoutSession } from "../server/lib/clover.js";

const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const SHIPPING_FLAT_RATE_MINOR = 3_000; // CA$30.00
const FREE_SHIPPING_THRESHOLD_MINOR = 40_000; // CA$400.00
const TAX_RATE = 0.05; // 5%
const LAUNCH_DISCOUNT_CODE = "LAUNCH10";
const LAUNCH_DISCOUNT_RATE = 0.1; // 10%
const isDebugLoggingEnabled = () => process.env.CLOVER_DEBUG_LOGS?.trim().toLowerCase() === "true";
const createRequestId = () => createDeterministicHash(`${Date.now()}|${Math.random()}`).slice(0, 12);
const maskValue = (value: string, keepStart = 3, keepEnd = 4) => {
  if (!value) {
    return "";
  }
  if (value.length <= keepStart + keepEnd) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, keepStart)}...${value.slice(-keepEnd)}`;
};
const safeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const toBoolean = (value: string | undefined) => value?.trim().toLowerCase() === "true";
const isShippingChargesEnabled = () => {
  const serverToggle = process.env.ENABLE_SHIPPING_CHARGES;
  if (typeof serverToggle === "string" && serverToggle.trim().length > 0) {
    return toBoolean(serverToggle);
  }

  return toBoolean(process.env.VITE_ENABLE_SHIPPING_CHARGES);
};

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
  deliveryMethod?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}) =>
  [
    customer.deliveryMethod || "shipping",
    customer.address || "",
    customer.city || "",
    customer.state || "",
    customer.postalCode || "",
    customer.country || "",
  ]
    .map((part) => part.trim().toLowerCase())
    .join("|");

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }
  const requestId = createRequestId();
  const debugLogs = isDebugLoggingEnabled();
  res.setHeader("X-Request-Id", requestId);

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
  const requestedDiscountCode = (payload.discountCode || payload.promoCode || "").trim().toUpperCase();
  if (requestedDiscountCode && requestedDiscountCode !== LAUNCH_DISCOUNT_CODE) {
    sendError(res, 400, "INVALID_DISCOUNT_CODE", "Invalid discount code.");
    return;
  }

  if (looksAutomatedTraffic(req)) {
    sendError(res, 403, "BOT_DETECTED", "Automated checkout attempts are not allowed.");
    return;
  }

  const config = validateServerConfiguration();
  if (!config.ok) {
    console.error("[clover-checkout] invalid server configuration", {
      requestId,
      hasMerchantId: Boolean(process.env.CLOVER_MERCHANT_ID?.trim()),
      hasPrivateToken: Boolean(process.env.CLOVER_PRIVATE_TOKEN?.trim()),
      checkoutBaseUrl: getCheckoutBaseUrl(),
      apiBaseUrl: process.env.CLOVER_API_BASE_URL?.trim() || "https://apisandbox.dev.clover.com",
      details: config.details,
    });
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

  const catalogMap = await getCatalogMap();

  const lineItems: OrderLineItem[] = [];
  for (const requestedItem of payload.items) {
    const product = catalogMap.get(requestedItem.productId);
    if (!product) {
      sendError(res, 400, "UNKNOWN_PRODUCT", `Product ${requestedItem.productId} is no longer available.`);
      return;
    }

    if (product.availability === "sold_out") {
      sendError(res, 400, "PRODUCT_SOLD_OUT", `${product.name} is currently sold out.`);
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
  const discountMinor = requestedDiscountCode === LAUNCH_DISCOUNT_CODE ? Math.round(subtotalMinor * LAUNCH_DISCOUNT_RATE) : 0;
  const discountedSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);
  const isPickupInStore = payload.customer.deliveryMethod === "pickup";
  const shippingMinor =
    !isPickupInStore && isShippingChargesEnabled() && subtotalMinor < FREE_SHIPPING_THRESHOLD_MINOR
      ? SHIPPING_FLAT_RATE_MINOR
      : 0;
  const taxMinor = Math.round((discountedSubtotalMinor + shippingMinor) * TAX_RATE);
  const totalMinor = discountedSubtotalMinor + shippingMinor + taxMinor;

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
    if (debugLogs) {
      console.log("[clover-checkout] reusing existing pending checkout", {
        requestId,
        orderId: existingOrder.id,
        checkoutId: existingOrder.cloverCheckoutId,
        paymentStatus: existingOrder.paymentStatus,
        idempotencyKeyHash: createDeterministicHash(idempotencyKey).slice(0, 12),
      });
    }
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

  const checkoutLineItems = [
    ...lineItems.map((item) => ({
      name: item.name,
      price: item.unitAmountMinor,
      unitQty: item.quantity,
    })),
    ...(discountMinor > 0
      ? [
          {
            name: `Discount (${LAUNCH_DISCOUNT_CODE})`,
            price: -discountMinor,
            unitQty: 1,
          },
        ]
      : []),
    ...(shippingMinor > 0
      ? [
          {
            name: "Shipping",
            price: shippingMinor,
            unitQty: 1,
          },
        ]
      : []),
    ...(taxMinor > 0
      ? [
          {
            name: "GST (5%)",
            price: taxMinor,
            unitQty: 1,
          },
        ]
      : []),
  ];

  const order =
    existingOrder ||
    await createPendingOrder({
      idempotencyKey,
      customer: {
        deliveryMethod: payload.customer.deliveryMethod,
        fullName: payload.customer.fullName,
        email: payload.customer.email,
        phone: payload.customer.phone,
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

  if (debugLogs) {
    console.log("[clover-checkout] creating checkout session", {
      requestId,
      orderId: order.id,
      itemCount: lineItems.length,
      subtotalMinor,
      shippingMinor,
      discountMinor,
      taxMinor,
      totalMinor,
      apiBaseUrl: config.apiBaseUrl,
      merchantId: maskValue(config.merchantId),
      tokenFingerprint: createDeterministicHash(config.privateToken).slice(0, 12),
      idempotencyKeyHash: createDeterministicHash(idempotencyKey).slice(0, 12),
    });
  }

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
      lineItems: checkoutLineItems,
      successUrl: `${config.checkoutBaseUrl}/checkout/success?orderId=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`,
      failureUrl: `${config.checkoutBaseUrl}/checkout/cancel?orderId=${encodeURIComponent(order.id)}&error_code={ERROR_CODE}`,
      timeoutMs: Number(process.env.CLOVER_TIMEOUT_MS || 12_000),
    });

    await attachCheckoutSession({
      orderId: order.id,
      checkoutUrl: session.checkoutUrl,
      checkoutId: session.checkoutId,
    });

    console.log("[clover-checkout] checkout session created", {
      requestId,
      orderId: order.id,
      cloverCheckoutId: session.checkoutId,
      checkoutUrlHost: (() => {
        try {
          return new URL(session.checkoutUrl).host;
        } catch {
          return "";
        }
      })(),
      apiBaseUrl: config.apiBaseUrl,
      merchantId: maskValue(config.merchantId),
      reused: false,
    });

    res.status(200).json({
      checkoutUrl: session.checkoutUrl,
      orderId: order.id,
      reused: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start checkout right now. Please try again in a moment.";
    const cloverErrorContext =
      error instanceof CloverApiError
        ? {
            statusCode: error.context.statusCode,
            endpoint: error.context.endpoint,
            apiBaseUrl: error.context.apiBaseUrl,
            cloverRequestId: error.context.responseRequestId,
            responseBody: error.context.responseBody,
          }
        : null;
    console.error("[clover-checkout] checkout session creation failed", {
      requestId,
      orderId: order.id,
      apiBaseUrl: config.apiBaseUrl,
      merchantId: maskValue(config.merchantId),
      tokenFingerprint: createDeterministicHash(config.privateToken).slice(0, 12),
      error: safeErrorMessage(error),
      clover: cloverErrorContext,
    });
    try {
      await markOrderFailed({ orderId: order.id, errorMessage: message });
    } catch (storeError) {
      console.error("[clover-checkout] failed to persist order failure", {
        requestId,
        orderId: order.id,
        error: safeErrorMessage(storeError),
      });
    }
    sendError(res, 502, "CHECKOUT_PROVIDER_ERROR", message);
  }
}
