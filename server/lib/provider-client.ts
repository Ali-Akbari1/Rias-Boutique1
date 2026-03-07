import { logger } from "./logger.js";
import { normalizeErrorMessage } from "./http.js";

export class ProviderConfigurationError extends Error {
  readonly provider: string;
  readonly missingKeys: string[];

  constructor(provider: string, missingKeys: string[]) {
    super(`Missing required ${provider} configuration: ${missingKeys.join(", ")}`);
    this.name = "ProviderConfigurationError";
    this.provider = provider;
    this.missingKeys = missingKeys;
  }
}

export class ProviderRequestError extends Error {
  readonly provider: string;
  readonly url: string;
  readonly statusCode: number;
  readonly responseBody: unknown;

  constructor({
    provider,
    url,
    statusCode,
    message,
    responseBody,
  }: {
    provider: string;
    url: string;
    statusCode: number;
    message: string;
    responseBody: unknown;
  }) {
    super(message);
    this.name = "ProviderRequestError";
    this.provider = provider;
    this.url = url;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export const requireProviderConfig = (provider: string, values: Record<string, string>) => {
  const missingKeys = Object.entries(values)
    .filter(([, value]) => !value.trim())
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new ProviderConfigurationError(provider, missingKeys);
  }
};

export const fetchProviderJson = async <T>({
  provider,
  url,
  method = "GET",
  headers,
  body,
  timeoutMs = 12_000,
}: {
  provider: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = (await response.json().catch(() => ({}))) as T;

    if (!response.ok) {
      logger.error("provider.request_failed", {
        provider,
        url,
        method,
        statusCode: response.status,
      });
      throw new ProviderRequestError({
        provider,
        url,
        statusCode: response.status,
        message: normalizeErrorMessage(payload, `${provider} request failed with status ${response.status}.`),
        responseBody: payload,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${provider} request timed out.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
