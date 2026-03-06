import { parseJsonBody, readRawBody, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import { applyRateLimitHeaders, checkRateLimit } from "../server/lib/rate-limit.js";
import { checkoutCustomerSchema, checkoutItemSchema } from "../server/lib/checkout-schema.js";
import {
  buildAllowedOrigins,
  getClientIp,
  looksAutomatedTraffic,
  validateOrigin,
} from "../server/lib/security.js";
import { getCatalogMap } from "../server/lib/product-catalog.js";
import {
  createShippingRatesQuote,
  describeEasyPostError,
  isEasyPostApiError,
  isEasyPostConfigured,
} from "../server/lib/easypost.js";
import { getFreeShippingThresholdMinor, isShippingChargesEnabled } from "../server/lib/checkout-pricing.js";
import { z } from "zod";

const DEFAULT_RATE_LIMIT = 40;
const DEFAULT_RATE_WINDOW_MS = 60_000;

const shippingRatesRequestSchema = z
  .object({
    customer: checkoutCustomerSchema,
    items: z.array(checkoutItemSchema).min(1).max(50),
  })
  .strict();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const allowedOrigins = buildAllowedOrigins(
    process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "",
    process.env.ALLOWED_CHECKOUT_ORIGINS?.trim() || "",
  );
  if (!validateOrigin(req, allowedOrigins, { allowMissingOrigin: false })) {
    sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    return;
  }

  const rateResult = checkRateLimit({
    key: `shipping-rates:${getClientIp(req)}`,
    limit: Number(process.env.SHIPPING_RATES_RATE_LIMIT || DEFAULT_RATE_LIMIT),
    windowMs: Number(process.env.SHIPPING_RATES_RATE_WINDOW_MS || DEFAULT_RATE_WINDOW_MS),
  });
  applyRateLimitHeaders(res.setHeader.bind(res), rateResult);
  if (!rateResult.allowed) {
    sendError(res, 429, "RATE_LIMITED", "Too many shipping quote requests. Please try again shortly.");
    return;
  }

  const rawBody = await readRawBody(req);
  const parsedBody = parseJsonBody<unknown>(rawBody);
  if (!parsedBody) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  const validation = shippingRatesRequestSchema.safeParse(parsedBody);
  if (!validation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Shipping request is invalid.", validation.error.flatten());
    return;
  }

  if (looksAutomatedTraffic(req)) {
    sendError(res, 403, "BOT_DETECTED", "Automated requests are not allowed.");
    return;
  }

  const { customer, items } = validation.data;
  if (customer.deliveryMethod === "pickup") {
    res.status(200).json({
      provider: "easypost",
      requiresSelection: false,
      freeShippingApplied: false,
      freeShippingThresholdMinor: getFreeShippingThresholdMinor(),
      options: [],
      selectedOptionToken: "",
      quoteExpiresAt: "",
      message: "Pick up in store selected. No shipping quote is required.",
    });
    return;
  }

  if (!isShippingChargesEnabled()) {
    sendError(res, 503, "SHIPPING_NOT_AVAILABLE", "Shipping is not available right now. Please select pickup.");
    return;
  }

  if (!isEasyPostConfigured()) {
    sendError(res, 503, "SHIPPING_NOT_CONFIGURED", "Shipping is not configured right now. Please contact support.");
    return;
  }

  const catalogMap = await getCatalogMap();
  let subtotalMinor = 0;
  const normalizedItems = [];
  for (const item of items) {
    const product = catalogMap.get(item.productId);
    if (!product) {
      sendError(res, 400, "UNKNOWN_PRODUCT", `Product ${item.productId} is no longer available.`);
      return;
    }

    if (product.availability === "sold_out") {
      sendError(res, 400, "PRODUCT_SOLD_OUT", `${product.name} is currently sold out.`);
      return;
    }

    subtotalMinor += product.priceMinor * item.quantity;
    normalizedItems.push({
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPriceMinor: product.priceMinor,
    });
  }

  try {
    const quote = await createShippingRatesQuote({
      customer,
      items: normalizedItems,
      subtotalMinor,
      freeShippingThresholdMinor: getFreeShippingThresholdMinor(),
    });

    res.status(200).json(quote);
  } catch (error) {
    console.error("[shipping-rates] quote failed", {
      error: describeEasyPostError(error),
      destinationCountry: customer.country,
      destinationPostalCode: customer.postalCode,
      lineItemCount: normalizedItems.length,
    });

    if (isEasyPostApiError(error) && error.statusCode >= 400 && error.statusCode < 500) {
      sendError(
        res,
        422,
        "ADDRESS_UNVERIFIED",
        error.message.replace(/^EasyPost API failed \(\d+\) on [^:]+:\s*/, ""),
        error.responseBody,
      );
      return;
    }

    if (
      error instanceof Error &&
      error.message.includes("International shipping quotes require EASYPOST_DEFAULT_HS_TARIFF_NUMBER")
    ) {
      sendError(res, 503, "INTERNATIONAL_SHIPPING_NOT_CONFIGURED", error.message);
      return;
    }

    sendError(
      res,
      502,
      "SHIPPING_PROVIDER_ERROR",
      error instanceof Error ? error.message : "Unable to retrieve shipping rates right now.",
    );
  }
}
