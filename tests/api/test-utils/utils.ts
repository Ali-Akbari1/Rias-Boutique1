import { createHmac } from "node:crypto";
import type { ApiRequest, ApiResponse } from "../../../server/lib/http.js";
import { createDeterministicHash } from "../../../server/lib/http.js";
import { canonicalizeCartItems } from "../../../server/lib/security.js";

const normalizeCountryCode = (value: string) => {
  const normalized = value.trim();
  const compact = normalized.replace(/[^a-zA-Z]/g, "").toLowerCase();

  if (compact === "canada" || compact === "ca" || compact === "can") {
    return "CA";
  }
  if (compact === "unitedstates" || compact === "unitedstatesofamerica" || compact === "usa" || compact === "us") {
    return "US";
  }

  return normalized.length === 2 ? normalized.toUpperCase() : normalized.toUpperCase();
};

export interface MockResponse extends ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  jsonBody: unknown;
  textBody: string;
}

export const createMockRequest = ({
  method = "GET",
  headers = {},
  body,
  query,
}: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}): ApiRequest => ({
  method,
  headers,
  body,
  query,
});

export const createMockResponse = (): MockResponse => {
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    jsonBody: null,
    textBody: "",
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.jsonBody = body;
    },
    send(body: string) {
      response.textBody = body;
    },
    setHeader(name: string, value: string) {
      response.headers[name] = value;
    },
  };

  return response;
};

export const createSignedShippingQuoteToken = ({
  customer,
  items,
  subtotalMinor,
  shipmentId = "shp_test_123",
  rateId = "rate_test_123",
  carrier = "Canada Post",
  service = "Expedited Parcel",
  quotedRateMinor = 1800,
  customerRateMinor = 1800,
  currency = "CAD",
  freeShippingApplied = false,
}: {
  customer: {
    deliveryMethod?: "shipping" | "pickup";
    fullName: string;
    email: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: Array<{ productId: string; quantity: number; selection?: { size?: string; color?: string } }>;
  subtotalMinor: number;
  shipmentId?: string;
  rateId?: string;
  carrier?: string;
  service?: string;
  quotedRateMinor?: number;
  customerRateMinor?: number;
  currency?: string;
  freeShippingApplied?: boolean;
}) => {
  const secret =
    process.env.EASYPOST_QUOTE_SECRET?.trim() ||
    process.env.CART_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "test_shipping_quote_secret";
  const canonicalCart =
    canonicalizeCartItems(
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        selection: item.selection,
      })),
    ) || "";
  const shippingFingerprint = [
    customer.deliveryMethod || "shipping",
    customer.address,
    customer.city,
    customer.state,
    customer.postalCode,
    normalizeCountryCode(customer.country),
  ]
    .map((part) => part.trim().toLowerCase())
    .join("|");
  const contextHash = createDeterministicHash(`${shippingFingerprint}|${canonicalCart}|${subtotalMinor}`);
  const selectedAt = new Date(Date.now() - 60_000).toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const payload = {
    v: 1,
    provider: "easypost",
    shipmentId,
    rateId,
    carrier,
    service,
    quotedRateMinor,
    customerRateMinor,
    currency,
    deliveryDays: 4,
    deliveryDate: "",
    freeShippingApplied,
    selectedAt,
    expiresAt,
    contextHash,
  };

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
};
