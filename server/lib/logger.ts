type LogLevel = "debug" | "info" | "warn" | "error";

const serializeError = (error: Error) => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
});

const sanitizeLogValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLogValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeLogValue(entry)]),
    );
  }

  return value;
};

const writeStructuredLog = (level: LogLevel, event: string, context?: Record<string, unknown>) => {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(context ? sanitizeLogValue(context) as Record<string, unknown> : {}),
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.log(payload);
};

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => writeStructuredLog("debug", event, context),
  info: (event: string, context?: Record<string, unknown>) => writeStructuredLog("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => writeStructuredLog("warn", event, context),
  error: (event: string, context?: Record<string, unknown>) => writeStructuredLog("error", event, context),
};
