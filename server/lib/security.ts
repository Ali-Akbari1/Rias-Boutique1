import { createHmac } from "node:crypto";
import {
  asSingle,
  createDeterministicHash,
  getHeader,
  safeTimingCompare,
  type ApiRequest,
  type ApiResponse,
} from "./http.js";

const DEFAULT_ALLOWED_DEV_ORIGINS = new Set([
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const toTrimmed = (value: string | undefined) => (value || "").trim();
const isProductionEnvironment = () =>
  ["production", "preview"].includes((process.env.VERCEL_ENV || process.env.NODE_ENV || "").trim().toLowerCase());

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
  const allowed = new Set<string>();
  if (!isProductionEnvironment()) {
    DEFAULT_ALLOWED_DEV_ORIGINS.forEach((origin) => allowed.add(origin));
  }

  const parsedBase = parseOrigin(baseUrl);
  if (parsedBase) {
    allowed.add(parsedBase);
  }

  [
    process.env.ALLOWED_BROWSER_ORIGINS || "",
    process.env.ALLOWED_PRODUCTION_ORIGINS || "",
    process.env.ALLOWED_PREVIEW_ORIGINS || "",
    process.env.ALLOWED_DEV_ORIGINS || "",
    customCsv,
  ]
    .flatMap((entry) => entry.split(","))
    .map((entry) => parseOrigin(entry.trim()))
    .filter(Boolean)
    .forEach((origin) => allowed.add(origin));

  const vercelUrls = [process.env.VERCEL_URL || "", process.env.VERCEL_BRANCH_URL || ""]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => parseOrigin(entry.startsWith("http") ? entry : `https://${entry}`))
    .filter(Boolean);
  vercelUrls.forEach((origin) => allowed.add(origin));

  return allowed;
};

interface ValidateOriginOptions {
  allowMissingOrigin?: boolean;
  allowRefererFallback?: boolean;
}

export const validateOrigin = (
  req: ApiRequest,
  allowedOrigins: Set<string>,
  options: ValidateOriginOptions = {},
) => {
  const { allowMissingOrigin = true, allowRefererFallback = true } = options;
  const origin = getRequestOrigin(req);
  if (!origin) {
    if (allowRefererFallback) {
      const refererOrigin = parseOrigin(toTrimmed(getHeader(req, "referer")));
      if (refererOrigin) {
        return allowedOrigins.has(refererOrigin);
      }
    }

    return allowMissingOrigin;
  }

  return allowedOrigins.has(parseOrigin(origin));
};

export const resolveAllowedOrigin = (
  req: ApiRequest,
  allowedOrigins: Set<string>,
  options: ValidateOriginOptions = {},
) => {
  const { allowMissingOrigin = true, allowRefererFallback = true } = options;
  const origin = getRequestOrigin(req);
  if (!origin) {
    if (allowRefererFallback) {
      const refererOrigin = parseOrigin(toTrimmed(getHeader(req, "referer")));
      if (refererOrigin && allowedOrigins.has(refererOrigin)) {
        return refererOrigin;
      }
    }

    return allowMissingOrigin ? "*" : "";
  }

  const parsedOrigin = parseOrigin(origin);
  if (!parsedOrigin || !allowedOrigins.has(parsedOrigin)) {
    return "";
  }

  return parsedOrigin;
};

export const applyCorsResponseHeaders = (
  res: ApiResponse,
  allowedOrigin: string,
  methods: string[] = ["GET", "POST"],
  headers: string[] = ["Content-Type", "Authorization", "X-Admin-Token"],
) => {
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", headers.join(", "));

  if (allowedOrigin && allowedOrigin !== "*") {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
};

export const looksAutomatedTraffic = (req: ApiRequest) => {
  const userAgent = toTrimmed(getHeader(req, "user-agent")).toLowerCase();
  if (!userAgent) {
    return true;
  }

  return ["python-requests", "curl", "wget", "scrapy", "headless"].some((token) => userAgent.includes(token));
};

const normalizeSignature = (signature: string) => {
  const trimmed = signature.trim().replace(/^"|"$/g, "");
  if (!trimmed || /^t=\d+$/i.test(trimmed)) {
    return "";
  }

  const keyValueMatch = trimmed.match(/^([a-z0-9_-]+)=(.+)$/i);
  if (!keyValueMatch) {
    return trimmed;
  }

  const key = keyValueMatch[1]?.trim().toLowerCase() || "";
  const value = keyValueMatch[2]?.trim().replace(/^"|"$/g, "") || "";
  if (!value) {
    return "";
  }

  if (
    key === "v1" ||
    key === "v0" ||
    key === "sha256" ||
    key === "sha1" ||
    key === "sha512" ||
    key === "signature" ||
    key === "sig" ||
    key === "hmac"
  ) {
    return value;
  }

  // Unknown key, but still likely key=value signature content. Keep value for best-effort interoperability.
  return value;
};

const isHexString = (value: string) => /^[0-9a-f]+$/i.test(value);
const toBase64Url = (value: string) => value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const toBase64Standard = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  return padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=");
};
const previewValue = (value: string, visible = 16) => {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= visible) {
    return normalized;
  }
  return `${normalized.slice(0, visible)}...(${normalized.length})`;
};
const fingerprintSecret = (value: string) => createDeterministicHash(`clover-secret:${value}`).slice(0, 12);

type SignatureAlgorithm = "sha256" | "sha1" | "sha512";
type SignatureEncoding = "hex" | "base64" | "base64url";
type PayloadVariantLabel = "t.body" | "t:body" | "body";

interface ExpectedSignatureCandidate {
  value: string;
  algorithm: SignatureAlgorithm;
  encoding: SignatureEncoding;
  payloadVariant: PayloadVariantLabel;
  secretFingerprint: string;
}

interface SignatureCandidateVariant {
  value: string;
  label: "raw" | "hex-lower" | "base64-standard" | "base64url";
}

export interface WebhookSignatureVerificationDiagnostic {
  valid: boolean;
  reason:
    | "missing_secret_or_signature"
    | "missing_signature_values"
    | "no_expected_candidates"
    | "matched"
    | "no_match";
  effectiveTimestamp: string;
  signatureCount: number;
  signatureSamples: string[];
  payloadVariants: Array<{
    label: PayloadVariantLabel;
    length: number;
  }>;
  secretFingerprints: string[];
  expectedCandidateCount: number;
  matched?: {
    candidateIndex: number;
    candidatePreview: string;
    candidateVariant: SignatureCandidateVariant["label"];
    algorithm: SignatureAlgorithm;
    encoding: SignatureEncoding;
    payloadVariant: PayloadVariantLabel;
    secretFingerprint: string;
  };
}

const buildSignatureCandidateVariants = (candidate: string): SignatureCandidateVariant[] => {
  const variants: SignatureCandidateVariant[] = [{ value: candidate, label: "raw" }];

  if (isHexString(candidate)) {
    variants.push({ value: candidate.toLowerCase(), label: "hex-lower" });
  }
  variants.push({ value: toBase64Standard(candidate), label: "base64-standard" });
  variants.push({ value: toBase64Url(candidate), label: "base64url" });

  const deduped: SignatureCandidateVariant[] = [];
  const seen = new Set<string>();
  for (const variant of variants) {
    const key = `${variant.label}:${variant.value}`;
    if (!seen.has(key)) {
      deduped.push(variant);
      seen.add(key);
    }
  }

  return deduped;
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

export const verifyWebhookSignatureDetailed = ({
  rawBody,
  signatureHeader,
  timestampHeader,
  secret,
}: {
  rawBody: string;
  signatureHeader: string;
  timestampHeader: string;
  secret: string | string[];
}): WebhookSignatureVerificationDiagnostic => {
  const secrets = (Array.isArray(secret) ? secret : [secret]).map((entry) => entry.trim()).filter(Boolean);
  if (secrets.length === 0 || !signatureHeader) {
    return {
      valid: false,
      reason: "missing_secret_or_signature",
      effectiveTimestamp: "",
      signatureCount: 0,
      signatureSamples: [],
      payloadVariants: [],
      secretFingerprints: secrets.map((entry) => fingerprintSecret(entry)),
      expectedCandidateCount: 0,
    };
  }

  const signatures = signatureHeader
    .split(",")
    .map((value) => normalizeSignature(value))
    .filter(Boolean);

  if (signatures.length === 0) {
    return {
      valid: false,
      reason: "missing_signature_values",
      effectiveTimestamp: "",
      signatureCount: 0,
      signatureSamples: [],
      payloadVariants: [],
      secretFingerprints: secrets.map((entry) => fingerprintSecret(entry)),
      expectedCandidateCount: 0,
    };
  }

  const effectiveTimestamp = resolveWebhookTimestamp(signatureHeader, timestampHeader);
  const payloads: Array<{ label: PayloadVariantLabel; value: string }> = effectiveTimestamp
    ? [
        { label: "t.body", value: `${effectiveTimestamp}.${rawBody}` },
        { label: "t:body", value: `${effectiveTimestamp}:${rawBody}` },
        { label: "body", value: rawBody },
      ]
    : [{ label: "body", value: rawBody }];

  const algorithms: SignatureAlgorithm[] = ["sha256", "sha1", "sha512"];
  const expectedCandidates: ExpectedSignatureCandidate[] = [];
  for (const secretEntry of secrets) {
    const secretFingerprint = fingerprintSecret(secretEntry);
    for (const payload of payloads) {
      for (const algorithm of algorithms) {
        const hex = createHmac(algorithm, secretEntry).update(payload.value).digest("hex");
        const base64 = createHmac(algorithm, secretEntry).update(payload.value).digest("base64");
        expectedCandidates.push({
          value: hex,
          algorithm,
          encoding: "hex",
          payloadVariant: payload.label,
          secretFingerprint,
        });
        expectedCandidates.push({
          value: base64,
          algorithm,
          encoding: "base64",
          payloadVariant: payload.label,
          secretFingerprint,
        });
        expectedCandidates.push({
          value: toBase64Url(base64),
          algorithm,
          encoding: "base64url",
          payloadVariant: payload.label,
          secretFingerprint,
        });
      }
    }
  }

  if (expectedCandidates.length === 0) {
    return {
      valid: false,
      reason: "no_expected_candidates",
      effectiveTimestamp,
      signatureCount: signatures.length,
      signatureSamples: signatures.slice(0, 3).map((value) => previewValue(value)),
      payloadVariants: payloads.map((entry) => ({ label: entry.label, length: entry.value.length })),
      secretFingerprints: secrets.map((entry) => fingerprintSecret(entry)),
      expectedCandidateCount: 0,
    };
  }

  for (let signatureIndex = 0; signatureIndex < signatures.length; signatureIndex += 1) {
    const candidate = signatures[signatureIndex] || "";
    const candidateVariants = buildSignatureCandidateVariants(candidate);

    for (const candidateVariant of candidateVariants) {
      for (const expectedCandidate of expectedCandidates) {
        if (safeTimingCompare(candidateVariant.value, expectedCandidate.value)) {
          return {
            valid: true,
            reason: "matched",
            effectiveTimestamp,
            signatureCount: signatures.length,
            signatureSamples: signatures.slice(0, 3).map((value) => previewValue(value)),
            payloadVariants: payloads.map((entry) => ({ label: entry.label, length: entry.value.length })),
            secretFingerprints: secrets.map((entry) => fingerprintSecret(entry)),
            expectedCandidateCount: expectedCandidates.length,
            matched: {
              candidateIndex: signatureIndex,
              candidatePreview: previewValue(candidate),
              candidateVariant: candidateVariant.label,
              algorithm: expectedCandidate.algorithm,
              encoding: expectedCandidate.encoding,
              payloadVariant: expectedCandidate.payloadVariant,
              secretFingerprint: expectedCandidate.secretFingerprint,
            },
          };
        }
      }
    }
  }

  return {
    valid: false,
    reason: "no_match",
    effectiveTimestamp,
    signatureCount: signatures.length,
    signatureSamples: signatures.slice(0, 3).map((value) => previewValue(value)),
    payloadVariants: payloads.map((entry) => ({ label: entry.label, length: entry.value.length })),
    secretFingerprints: secrets.map((entry) => fingerprintSecret(entry)),
    expectedCandidateCount: expectedCandidates.length,
  };
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
}) => verifyWebhookSignatureDetailed({ rawBody, signatureHeader, timestampHeader, secret }).valid;

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
  items: Array<{
    productId?: string | null;
    quantity?: number | null;
    selection?: { size?: string | null; color?: string | null } | null;
  }>,
) =>
  items
    .map((item) => ({
      productId: String(item.productId || "").trim(),
      quantity: Number(item.quantity),
      selection: {
        size: String(item.selection?.size || "").trim().toLowerCase(),
        color: String(item.selection?.color || "").trim().toLowerCase(),
      },
    }))
    .filter((item) => item.productId.length > 0 && Number.isFinite(item.quantity) && item.quantity > 0)
    .sort((a, b) => {
      const idCompare = a.productId.localeCompare(b.productId);
      if (idCompare !== 0) {
        return idCompare;
      }
      const sizeCompare = a.selection.size.localeCompare(b.selection.size);
      if (sizeCompare !== 0) {
        return sizeCompare;
      }
      return a.selection.color.localeCompare(b.selection.color);
    })
    .map((item) => `${item.productId}:${item.quantity}:${item.selection.size}:${item.selection.color}`)
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
