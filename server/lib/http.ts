import { createHash, timingSafeEqual } from "node:crypto";

export type HeaderValue = string | string[] | undefined;

export interface ApiRequest {
  method?: string;
  headers: Record<string, HeaderValue>;
  query?: Record<string, HeaderValue>;
  body?: unknown;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface ApiResponse {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  send?: (body: string) => void;
  setHeader: (name: string, value: string) => void;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asSingle = (value: HeaderValue) => (Array.isArray(value) ? value[0] : value);

export const getHeader = (req: ApiRequest, headerName: string) => {
  const key = headerName.toLowerCase();
  return asSingle(req.headers[key]);
};

export const getQueryValue = (req: ApiRequest, queryName: string) => {
  if (!req.query) {
    return "";
  }
  return asSingle(req.query[queryName]) || "";
};

export const sendError = (
  res: ApiResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) => {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };

  res.status(statusCode).json(body);
};

export const normalizeErrorMessage = (payload: unknown, fallback: string) => {
  if (!isObject(payload)) {
    return fallback;
  }

  const directError = payload.error;
  if (typeof directError === "string" && directError.trim()) {
    return directError.trim();
  }
  if (isObject(directError) && typeof directError.message === "string" && directError.message.trim()) {
    return directError.message.trim();
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return fallback;
};

export const readRawBody = async (req: ApiRequest): Promise<string> => {
  if (typeof req.body === "string") {
    return req.body;
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }
  if (req.body !== undefined) {
    return JSON.stringify(req.body);
  }

  if (!req.on) {
    return "";
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on?.("data", (chunk: unknown) => {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
        return;
      }
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    });
    req.on?.("end", () => resolve());
    req.on?.("error", (error: unknown) => reject(error));
  });

  return Buffer.concat(chunks).toString("utf8");
};

// Reads body bytes directly from the request stream without touching req.body.
// This is required for webhook signature verification, where any JSON parsing
// can alter the payload and invalidate HMAC checks.
export const readRawBodyFromStream = async (req: ApiRequest): Promise<string> => {
  if (!req.on) {
    return "";
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on?.("data", (chunk: unknown) => {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
        return;
      }
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    });
    req.on?.("end", () => resolve());
    req.on?.("error", (error: unknown) => reject(error));
  });

  return Buffer.concat(chunks).toString("utf8");
};

export const parseJsonBody = <T>(rawBody: string): T | null => {
  const normalized = rawBody.trim();
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized) as T;
  } catch {
    return null;
  }
};

export const createDeterministicHash = (value: string) => createHash("sha256").update(value).digest("hex");

export const safeTimingCompare = (first: string, second: string) => {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
};
