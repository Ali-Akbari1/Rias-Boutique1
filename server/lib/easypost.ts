import { createHmac } from "node:crypto";
import QRCode from "qrcode";
import { createDeterministicHash } from "./http.js";
import { canonicalizeCartItems } from "./security.js";

interface QuoteCustomer {
  deliveryMethod?: "shipping" | "pickup";
  fullName: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface QuoteLineItem {
  productId: string;
  name?: string;
  quantity: number;
}

export interface ShippingRateOption {
  token: string;
  carrier: string;
  service: string;
  label: string;
  quotedRateMinor: number;
  customerRateMinor: number;
  currency: string;
  deliveryDays: number | null;
  deliveryDate: string;
  shipmentId: string;
}

export interface ShippingRatesQuoteResult {
  provider: "easypost";
  requiresSelection: boolean;
  freeShippingApplied: boolean;
  freeShippingThresholdMinor: number;
  options: ShippingRateOption[];
  selectedOptionToken: string;
  quoteExpiresAt: string;
  message: string;
}

export interface VerifiedShippingQuote {
  provider: "easypost";
  shipmentId: string;
  rateId: string;
  carrier: string;
  service: string;
  quotedRateMinor: number;
  customerRateMinor: number;
  currency: string;
  deliveryDays: number | null;
  deliveryDate: string;
  freeShippingApplied: boolean;
  selectedAt: string;
  expiresAt: string;
  contextHash: string;
  tokenHash: string;
}

export interface PurchasedShipmentDetails {
  provider: "easypost";
  shipmentId: string;
  rateId: string;
  carrier: string;
  service: string;
  quotedRateMinor: number;
  customerRateMinor: number;
  currency: string;
  trackingCode: string;
  trackingUrl: string;
  labelUrl: string;
  labelPdfUrl: string;
  trackingQrCodeDataUrl: string;
  labelQrCodeDataUrl: string;
  status: string;
  purchasedAt: string;
}

interface EasyPostRate {
  id?: string;
  carrier?: string;
  service?: string;
  rate?: string;
  currency?: string;
  retail_rate?: string;
  retail_currency?: string;
  delivery_days?: number | null;
  est_delivery_days?: number | null;
  delivery_date?: string | null;
}

interface EasyPostTracker {
  tracking_code?: string | null;
  public_url?: string | null;
}

interface EasyPostPostageLabel {
  label_url?: string | null;
  label_pdf_url?: string | null;
}

interface EasyPostShipmentResponse {
  id?: string;
  rates?: EasyPostRate[];
  tracker?: EasyPostTracker | null;
  tracking_code?: string | null;
  status?: string | null;
  selected_rate?: EasyPostRate | null;
  postage_label?: EasyPostPostageLabel | null;
}

interface ShippingQuoteTokenPayload {
  v: 1;
  provider: "easypost";
  shipmentId: string;
  rateId: string;
  carrier: string;
  service: string;
  quotedRateMinor: number;
  customerRateMinor: number;
  currency: string;
  deliveryDays: number | null;
  deliveryDate: string;
  freeShippingApplied: boolean;
  selectedAt: string;
  expiresAt: string;
  contextHash: string;
}

interface EasyPostContextInput {
  customer: QuoteCustomer;
  items: QuoteLineItem[];
  subtotalMinor: number;
}

interface CreateShippingRatesQuoteInput extends EasyPostContextInput {
  freeShippingThresholdMinor: number;
}

const EASYPOST_API_BASE_URL = (process.env.EASYPOST_API_BASE_URL?.trim() || "https://api.easypost.com/v2").replace(
  /\/+$/,
  "",
);
const DEFAULT_QUOTE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PARCEL_LENGTH_IN = 16;
const DEFAULT_PARCEL_WIDTH_IN = 12;
const DEFAULT_PARCEL_HEIGHT_IN = 3;
const DEFAULT_ITEM_WEIGHT_OZ = 24;
const DEFAULT_ADDITIONAL_ITEM_WEIGHT_OZ = 12;
const DEFAULT_ADDITIONAL_ITEM_HEIGHT_IN = 0.75;
const DEFAULT_PREFERRED_CARRIERS = ["canada post"];

const safeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const toMinor = (value: string | undefined, fallbackValue: string | undefined, fallbackMinor = 0) => {
  const candidates = [value, fallbackValue];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed * 100);
    }
  }
  return fallbackMinor;
};
const normalizeString = (value: string | undefined) => value?.trim() || "";
const normalizePreferenceValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const parsePreferenceList = (value: string | undefined, fallback: string[] = []) =>
  (value || "")
    .split(",")
    .map((entry) => normalizePreferenceValue(entry))
    .filter(Boolean)
    .concat(fallback)
    .filter((entry, index, entries) => entries.indexOf(entry) === index);
const getQuoteSecret = () =>
  normalizeString(process.env.EASYPOST_QUOTE_SECRET) ||
  normalizeString(process.env.CART_TOKEN_SECRET) ||
  normalizeString(process.env.SUPABASE_SERVICE_ROLE_KEY);
const getPreferredCarriers = () =>
  parsePreferenceList(process.env.EASYPOST_PREFERRED_CARRIERS, DEFAULT_PREFERRED_CARRIERS);
const getPreferredServices = () => parsePreferenceList(process.env.EASYPOST_PREFERRED_SERVICES);

const getOriginAddress = () => ({
  name: normalizeString(process.env.EASYPOST_FROM_NAME) || normalizeString(process.env.STORE_BRAND_NAME) || "Ria's Boutique",
  company: normalizeString(process.env.EASYPOST_FROM_COMPANY) || normalizeString(process.env.STORE_BRAND_NAME) || "Ria's Boutique",
  street1:
    normalizeString(process.env.EASYPOST_FROM_STREET1) ||
    normalizeString(process.env.VITE_STORE_PICKUP_ADDRESS) ||
    normalizeString(process.env.STORE_ORIGIN_ADDRESS),
  street2: normalizeString(process.env.EASYPOST_FROM_STREET2),
  city: normalizeString(process.env.EASYPOST_FROM_CITY) || normalizeString(process.env.STORE_ORIGIN_CITY),
  state: normalizeString(process.env.EASYPOST_FROM_STATE) || normalizeString(process.env.STORE_ORIGIN_STATE),
  zip: normalizeString(process.env.EASYPOST_FROM_ZIP) || normalizeString(process.env.STORE_ORIGIN_POSTAL_CODE),
  country: normalizeString(process.env.EASYPOST_FROM_COUNTRY) || normalizeString(process.env.STORE_ORIGIN_COUNTRY) || "CA",
  phone:
    normalizeString(process.env.EASYPOST_FROM_PHONE) ||
    normalizeString(process.env.VITE_STORE_PICKUP_PHONE_HREF) ||
    normalizeString(process.env.STORE_ORIGIN_PHONE),
  email: normalizeString(process.env.EASYPOST_FROM_EMAIL) || normalizeString(process.env.MERCHANT_ORDER_EMAIL),
});

const validateEasyPostConfig = () => {
  const apiKey = normalizeString(process.env.EASYPOST_API_KEY);
  const quoteSecret = getQuoteSecret();
  const origin = getOriginAddress();

  const missingOriginFields = ["street1", "city", "state", "zip", "country"].filter(
    (field) => !origin[field as keyof typeof origin],
  );

  if (!apiKey) {
    throw new Error("EasyPost is not configured. Missing EASYPOST_API_KEY.");
  }

  if (!quoteSecret) {
    throw new Error("EasyPost quote signing is not configured. Set EASYPOST_QUOTE_SECRET or CART_TOKEN_SECRET.");
  }

  if (missingOriginFields.length > 0) {
    throw new Error(`EasyPost origin address is incomplete. Missing: ${missingOriginFields.join(", ")}.`);
  }

  return {
    apiKey,
    quoteSecret,
    origin,
    quoteTtlMs: toNumber(process.env.EASYPOST_QUOTE_TTL_MS, DEFAULT_QUOTE_TTL_MS),
  };
};

const buildShippingContextHash = ({ customer, items, subtotalMinor }: EasyPostContextInput) => {
  const canonicalCart =
    canonicalizeCartItems(
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    ) || "";

  const shippingFingerprint = [
    customer.deliveryMethod || "shipping",
    customer.fullName,
    customer.email,
    customer.address,
    customer.city,
    customer.state,
    customer.postalCode,
    customer.country,
  ]
    .map((part) => normalizeString(part).toLowerCase())
    .join("|");

  return createDeterministicHash(`${shippingFingerprint}|${canonicalCart}|${subtotalMinor}`);
};

const encodeQuoteToken = (payload: ShippingQuoteTokenPayload, secret: string) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
};

const decodeQuoteToken = (token: string, secret: string): ShippingQuoteTokenPayload => {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    throw new Error("Shipping quote token is malformed.");
  }

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (expected !== signature) {
    throw new Error("Shipping quote token signature is invalid.");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ShippingQuoteTokenPayload;
  if (payload.v !== 1 || payload.provider !== "easypost") {
    throw new Error("Shipping quote token version is unsupported.");
  }

  return payload;
};

const formatRateLabel = (carrier: string, service: string) => [carrier, service].filter(Boolean).join(" ") || "Shipping";

const normalizeDeliveryDays = (rate: EasyPostRate) => {
  if (typeof rate.delivery_days === "number" && Number.isFinite(rate.delivery_days)) {
    return rate.delivery_days;
  }
  if (typeof rate.est_delivery_days === "number" && Number.isFinite(rate.est_delivery_days)) {
    return rate.est_delivery_days;
  }
  return null;
};

const getPreferenceRank = (value: string, preferences: string[]) => {
  const normalizedValue = normalizePreferenceValue(value);
  const index = preferences.findIndex((entry) => entry === normalizedValue);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const buildParcel = (totalQuantity: number) => {
  const safeQuantity = Math.max(1, totalQuantity);
  const baseLength = toNumber(process.env.EASYPOST_PARCEL_LENGTH_IN, DEFAULT_PARCEL_LENGTH_IN);
  const baseWidth = toNumber(process.env.EASYPOST_PARCEL_WIDTH_IN, DEFAULT_PARCEL_WIDTH_IN);
  const baseHeight = toNumber(process.env.EASYPOST_PARCEL_HEIGHT_IN, DEFAULT_PARCEL_HEIGHT_IN);
  const baseWeight = toNumber(process.env.EASYPOST_ITEM_WEIGHT_OZ, DEFAULT_ITEM_WEIGHT_OZ);
  const extraWeight = toNumber(process.env.EASYPOST_ADDITIONAL_ITEM_WEIGHT_OZ, DEFAULT_ADDITIONAL_ITEM_WEIGHT_OZ);
  const extraHeight = toNumber(process.env.EASYPOST_ADDITIONAL_ITEM_HEIGHT_IN, DEFAULT_ADDITIONAL_ITEM_HEIGHT_IN);

  return {
    length: Number(baseLength.toFixed(2)),
    width: Number(baseWidth.toFixed(2)),
    height: Number((baseHeight + Math.max(0, safeQuantity - 1) * extraHeight).toFixed(2)),
    weight: Number((baseWeight + Math.max(0, safeQuantity - 1) * extraWeight).toFixed(2)),
  };
};

const easypostRequest = async <T>({
  endpoint,
  method = "POST",
  body,
}: {
  endpoint: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}) => {
  const { apiKey } = validateEasyPostConfig();
  const response = await fetch(`${EASYPOST_API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`EasyPost API failed (${response.status}) on ${endpoint}: ${errorBody || response.statusText}`);
  }

  return (await response.json()) as T;
};

const selectDisplayRates = ({
  rates,
  subtotalMinor,
  freeShippingThresholdMinor,
}: {
  rates: EasyPostRate[];
  subtotalMinor: number;
  freeShippingThresholdMinor: number;
}) => {
  const preferredCarriers = getPreferredCarriers();
  const preferredServices = getPreferredServices();

  const normalized = rates
    .map((rate) => {
      const currency = normalizeString(rate.currency || rate.retail_currency).toUpperCase();
      const quotedRateMinor = toMinor(rate.rate, rate.retail_rate);
      const carrier = normalizeString(rate.carrier);
      const service = normalizeString(rate.service);
      const rateId = normalizeString(rate.id);

      if (!rateId || !carrier || !service || quotedRateMinor <= 0) {
        return null;
      }

      return {
        rateId,
        carrier,
        service,
        label: formatRateLabel(carrier, service),
        carrierRank: getPreferenceRank(carrier, preferredCarriers),
        serviceRank: getPreferenceRank(service, preferredServices),
        quotedRateMinor,
        customerRateMinor: subtotalMinor >= freeShippingThresholdMinor ? 0 : quotedRateMinor,
        currency: currency || "CAD",
        deliveryDays: normalizeDeliveryDays(rate),
        deliveryDate: normalizeString(rate.delivery_date),
      };
    })
    .filter((rate): rate is NonNullable<typeof rate> => rate !== null);

  const preferredCarrierMatches = normalized.filter((rate) => rate.carrierRank !== Number.MAX_SAFE_INTEGER);
  const candidateRates = preferredCarrierMatches.length > 0 ? preferredCarrierMatches : normalized;

  const rankedRates = candidateRates
    .sort((a, b) => {
      if (a.carrierRank !== b.carrierRank) {
        return a.carrierRank - b.carrierRank;
      }
      if (a.serviceRank !== b.serviceRank) {
        return a.serviceRank - b.serviceRank;
      }
      if (a.customerRateMinor !== b.customerRateMinor) {
        return a.customerRateMinor - b.customerRateMinor;
      }
      if ((a.deliveryDays ?? Number.MAX_SAFE_INTEGER) !== (b.deliveryDays ?? Number.MAX_SAFE_INTEGER)) {
        return (a.deliveryDays ?? Number.MAX_SAFE_INTEGER) - (b.deliveryDays ?? Number.MAX_SAFE_INTEGER);
      }
      return a.label.localeCompare(b.label);
    });

  if (subtotalMinor >= freeShippingThresholdMinor) {
    return rankedRates.slice(0, 1);
  }

  return rankedRates.slice(0, 3);
};

export const createShippingRatesQuote = async ({
  customer,
  items,
  subtotalMinor,
  freeShippingThresholdMinor,
}: CreateShippingRatesQuoteInput): Promise<ShippingRatesQuoteResult> => {
  const { quoteSecret, origin, quoteTtlMs } = validateEasyPostConfig();
  const totalQuantity = items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
  const createdAt = new Date();
  const quoteExpiresAt = new Date(createdAt.getTime() + quoteTtlMs).toISOString();
  const shipment = await easypostRequest<EasyPostShipmentResponse>({
    endpoint: "/shipments",
    body: {
      shipment: {
        to_address: {
          name: customer.fullName,
          street1: customer.address,
          city: customer.city,
          state: customer.state,
          zip: customer.postalCode,
          country: customer.country,
          phone: customer.phone || undefined,
          email: customer.email,
        },
        from_address: origin,
        parcel: buildParcel(totalQuantity),
        options: {
          currency: "CAD",
          label_file_type: "image/png",
          label_size: "4x6",
        },
      },
    },
  });

  const shipmentId = normalizeString(shipment.id);
  if (!shipmentId) {
    throw new Error("EasyPost did not return a shipment ID.");
  }

  const displayRates = selectDisplayRates({
    rates: Array.isArray(shipment.rates) ? shipment.rates : [],
    subtotalMinor,
    freeShippingThresholdMinor,
  });
  if (displayRates.length === 0) {
    throw new Error("No EasyPost shipping rates were returned for this address.");
  }

  const contextHash = buildShippingContextHash({ customer, items, subtotalMinor });
  const options = displayRates.map((rate) => {
    const payload: ShippingQuoteTokenPayload = {
      v: 1,
      provider: "easypost",
      shipmentId,
      rateId: rate.rateId,
      carrier: rate.carrier,
      service: rate.service,
      quotedRateMinor: rate.quotedRateMinor,
      customerRateMinor: rate.customerRateMinor,
      currency: rate.currency,
      deliveryDays: rate.deliveryDays,
      deliveryDate: rate.deliveryDate,
      freeShippingApplied: subtotalMinor >= freeShippingThresholdMinor,
      selectedAt: createdAt.toISOString(),
      expiresAt: quoteExpiresAt,
      contextHash,
    };

    return {
      token: encodeQuoteToken(payload, quoteSecret),
      carrier: rate.carrier,
      service: rate.service,
      label: rate.label,
      quotedRateMinor: rate.quotedRateMinor,
      customerRateMinor: rate.customerRateMinor,
      currency: rate.currency,
      deliveryDays: rate.deliveryDays,
      deliveryDate: rate.deliveryDate,
      shipmentId,
    } satisfies ShippingRateOption;
  });

  const freeShippingApplied = subtotalMinor >= freeShippingThresholdMinor;

  return {
    provider: "easypost",
    requiresSelection: !freeShippingApplied && options.length > 1,
    freeShippingApplied,
    freeShippingThresholdMinor,
    options,
    selectedOptionToken: options[0]?.token || "",
    quoteExpiresAt,
    message: freeShippingApplied
      ? "Complimentary standard shipping applied. We will cover the selected rate."
      : "Live shipping rates are based on your address and parcel estimate.",
  };
};

export const verifyShippingQuoteToken = ({
  token,
  customer,
  items,
  subtotalMinor,
}: {
  token: string;
  customer: QuoteCustomer;
  items: QuoteLineItem[];
  subtotalMinor: number;
}): VerifiedShippingQuote => {
  const { quoteSecret } = validateEasyPostConfig();
  const payload = decodeQuoteToken(token, quoteSecret);
  const contextHash = buildShippingContextHash({ customer, items, subtotalMinor });
  if (payload.contextHash !== contextHash) {
    throw new Error("Shipping quote no longer matches the current cart or address.");
  }

  if (Date.now() > Date.parse(payload.expiresAt)) {
    throw new Error("Shipping quote expired. Please refresh rates and try again.");
  }

  return {
    provider: "easypost",
    shipmentId: payload.shipmentId,
    rateId: payload.rateId,
    carrier: payload.carrier,
    service: payload.service,
    quotedRateMinor: payload.quotedRateMinor,
    customerRateMinor: payload.customerRateMinor,
    currency: payload.currency,
    deliveryDays: payload.deliveryDays,
    deliveryDate: payload.deliveryDate,
    freeShippingApplied: payload.freeShippingApplied,
    selectedAt: payload.selectedAt,
    expiresAt: payload.expiresAt,
    contextHash: payload.contextHash,
    tokenHash: createDeterministicHash(token).slice(0, 16),
  };
};

const buildQrCodeDataUrl = async (value: string) =>
  value
    ? QRCode.toDataURL(value, {
        margin: 1,
        width: 180,
        color: {
          dark: "#111827",
          light: "#FFFFFF",
        },
      })
    : "";

export const buyShippingLabel = async (quote: VerifiedShippingQuote): Promise<PurchasedShipmentDetails> => {
  const purchasedAt = new Date().toISOString();
  const shipment = await easypostRequest<EasyPostShipmentResponse>({
    endpoint: `/shipments/${encodeURIComponent(quote.shipmentId)}/buy`,
    body: {
      rate: {
        id: quote.rateId,
      },
    },
  });

  const trackingCode =
    normalizeString(shipment.tracking_code) || normalizeString(shipment.tracker?.tracking_code) || "";
  const trackingUrl = normalizeString(shipment.tracker?.public_url);
  const labelUrl = normalizeString(shipment.postage_label?.label_url);
  const labelPdfUrl = normalizeString(shipment.postage_label?.label_pdf_url);

  return {
    provider: "easypost",
    shipmentId: quote.shipmentId,
    rateId: quote.rateId,
    carrier: quote.carrier,
    service: quote.service,
    quotedRateMinor: quote.quotedRateMinor,
    customerRateMinor: quote.customerRateMinor,
    currency: quote.currency,
    trackingCode,
    trackingUrl,
    labelUrl,
    labelPdfUrl,
    trackingQrCodeDataUrl: await buildQrCodeDataUrl(trackingUrl),
    labelQrCodeDataUrl: await buildQrCodeDataUrl(labelPdfUrl || labelUrl),
    status: normalizeString(shipment.status) || "unknown",
    purchasedAt,
  };
};

export const isEasyPostConfigured = () => {
  try {
    validateEasyPostConfig();
    return true;
  } catch {
    return false;
  }
};

export const describeEasyPostError = (error: unknown) => safeErrorMessage(error);
