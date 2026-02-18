import { createHmac } from "node:crypto";
import { asSingle, createDeterministicHash, getHeader, safeTimingCompare, type ApiRequest } from "./http.js";

const DEFAULT_ALLOWED_DEV_ORIGINS = new Set([
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const toTrimmed = (value: string | undefined) => (value || "").trim();

export const getClientIp = (req: ApiRequest) => {
  const forwardedFor = getHeader(req, "x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return getHeader(req, "x-real-ip") || "unknown";
};

export const getRequestOrigin = (req: ApiRequest) => toTrimmed(getHeader(req, "origin"));

const parseOrigin = (origin: string) => {
  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch {
    return "";
  }
};

export const buildAllowedOrigins = (baseUrl: string, customCsv = "") => {
  const allowed = new Set<string>(DEFAULT_ALLOWED_DEV_ORIGINS);
  const parsedBase = parseOrigin(baseUrl);
  if (parsedBase) {
    allowed.add(parsedBase);
  }

  customCsv
    .split(",")
    .map((entry) => parseOrigin(entry.trim()))
    .filter(Boolean)
    .forEach((origin) => allowed.add(origin));

  return allowed;
};

export const validateOrigin = (req: ApiRequest, allowedOrigins: Set<string>) => {
  const origin = getRequestOrigin(req);
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(parseOrigin(origin));
};

export const looksAutomatedTraffic = (req: ApiRequest) => {
  const userAgent = toTrimmed(getHeader(req, "user-agent")).toLowerCase();
  if (!userAgent) {
    return true;
  }

  return ["python-requests", "curl", "wget", "scrapy", "headless"].some((token) => userAgent.includes(token));
};

const normalizeSignature = (signature: string) => {
  const trimmed = signature.trim();
  if (!trimmed || /^t=\d+$/i.test(trimmed)) {
    return "";
  }
  const withoutAlgo = trimmed.replace(/^sha256=/i, "").replace(/^v1=/i, "");
  const parts = withoutAlgo.split("=");
  return parts.length > 1 ? parts.at(-1)?.trim() || "" : withoutAlgo;
};

export const resolveWebhookTimestamp = (signatureHeader: string, timestampHeader: string) => {
  const headerTimestamp = timestampHeader.trim();
  if (headerTimestamp) {
    return headerTimestamp;
  }

  const signatureTimestamp = signatureHeader
    .split(",")
    .map((value) => value.trim())
    .find((part) => /^t=\d+$/i.test(part))
    ?.replace(/^t=/i, "")
    .trim();

  return signatureTimestamp || "";
};

export const verifyWebhookSignature = ({
  rawBody,
  signatureHeader,
  timestampHeader,
  secret,
}: {
  rawBody: string;
  signatureHeader: string;
  timestampHeader: string;
  secret: string | string[];
}) => {
  const secrets = (Array.isArray(secret) ? secret : [secret]).map((entry) => entry.trim()).filter(Boolean);
  if (secrets.length === 0 || !signatureHeader) {
    return false;
  }

  const signatures = signatureHeader
    .split(",")
    .map((value) => normalizeSignature(value))
    .filter(Boolean);

  if (signatures.length === 0) {
    return false;
  }

  const effectiveTimestamp = resolveWebhookTimestamp(signatureHeader, timestampHeader);
  const payloads = effectiveTimestamp ? [`${effectiveTimestamp}.${rawBody}`, rawBody] : [rawBody];

  const expectedSignatures = secrets.flatMap((secretEntry) =>
    payloads.flatMap((payload) => [
      createHmac("sha256", secretEntry).update(payload).digest("hex"),
      createHmac("sha256", secretEntry).update(payload).digest("base64"),
    ]),
  );

  return signatures.some((candidate) => expectedSignatures.some((expected) => safeTimingCompare(candidate, expected)));
};

export const verifyWebhookTimestamp = (timestampHeader: string, toleranceMs: number) => {
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = Date.now();
  const timestampMs = timestamp > 1e12 ? timestamp : timestamp * 1000;
  return Math.abs(now - timestampMs) <= toleranceMs;
};

export const canonicalizeCartItems = (
  items: Array<{ productId?: string | null; quantity?: number | null }>,
) =>
  items
    .map((item) => ({
      productId: String(item.productId || "").trim(),
      quantity: Number(item.quantity),
    }))
    .filter((item) => item.productId.length > 0 && Number.isFinite(item.quantity) && item.quantity > 0)
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((item) => `${item.productId}:${item.quantity}`)
    .join("|");

export const buildCheckoutIdempotencyKey = ({
  email,
  cartCanonical,
  shippingFingerprint,
  timeBucket = Math.floor(Date.now() / (15 * 60 * 1000)),
}: {
  email: string;
  cartCanonical: string;
  shippingFingerprint: string;
  timeBucket?: number;
}) => createDeterministicHash(`${email.trim().toLowerCase()}|${cartCanonical}|${shippingFingerprint}|${timeBucket}`);

export const createCartToken = ({
  secret,
  canonicalCart,
  timestamp,
}: {
  secret: string;
  canonicalCart: string;
  timestamp: number;
}) => createHmac("sha256", secret).update(`${timestamp}.${canonicalCart}`).digest("hex");

export const verifyCartToken = ({
  secret,
  canonicalCart,
  timestamp,
  token,
  maxAgeMs,
}: {
  secret: string;
  canonicalCart: string;
  timestamp: number;
  token: string;
  maxAgeMs: number;
}) => {
  if (!secret || !token || !Number.isFinite(timestamp)) {
    return false;
  }

  const issuedAt = timestamp > 1e12 ? timestamp : timestamp * 1000;
  if (Math.abs(Date.now() - issuedAt) > maxAgeMs) {
    return false;
  }

  const expected = createCartToken({ secret, canonicalCart, timestamp });
  return safeTimingCompare(token, expected);
};

export const getForwardedProto = (req: ApiRequest) => asSingle(req.headers["x-forwarded-proto"]) || "https";
