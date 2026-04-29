interface RequestJsonOptions {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  cache?: RequestCache;
  headers?: Record<string, string>;
  fallbackErrorMessage: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getTrimmedString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const extractApiErrorMessage = (payload: unknown, fallback: string) => {
  if (!isRecord(payload)) {
    return fallback;
  }

  const directErrorMessage = getTrimmedString(payload.error);
  if (directErrorMessage) {
    return directErrorMessage;
  }

  if (isRecord(payload.error)) {
    const nestedErrorMessage = getTrimmedString(payload.error.message);
    if (nestedErrorMessage) {
      return nestedErrorMessage;
    }
  }

  const topLevelMessage = getTrimmedString(payload.message);
  return topLevelMessage || fallback;
};

export const requestJson = async <T>({
  path,
  method = "GET",
  body,
  signal,
  cache,
  headers,
  fallbackErrorMessage,
}: RequestJsonOptions): Promise<T> => {
  const response = await fetch(path, {
    method,
    signal,
    cache,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json().catch((): unknown => ({}));
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, fallbackErrorMessage));
  }

  return payload as T;
};
