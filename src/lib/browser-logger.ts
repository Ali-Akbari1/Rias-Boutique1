type BrowserLogLevel = "info" | "warn" | "error";

const sanitizeBrowserLogValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeBrowserLogValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeBrowserLogValue(entry)]),
    );
  }

  return value;
};

const writeBrowserLog = (level: BrowserLogLevel, event: string, context?: Record<string, unknown>) => {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(context ? (sanitizeBrowserLogValue(context) as Record<string, unknown>) : {}),
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

export const browserLogger = {
  info: (event: string, context?: Record<string, unknown>) => writeBrowserLog("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => writeBrowserLog("warn", event, context),
  error: (event: string, context?: Record<string, unknown>) => writeBrowserLog("error", event, context),
};
