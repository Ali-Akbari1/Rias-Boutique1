import { createDeterministicHash } from "./http.js";

interface ParsedCloverWebhook {
  eventId: string;
  eventType: string;
  orderId: string;
  checkoutId: string;
  paymentReference: string;
  isPaidEvent: boolean;
}

const asObject = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null);
const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const asScalarString = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
};
const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const pullNestedString = (payload: Record<string, unknown>, keys: string[]) => {
  const keySet = new Set(keys.map((key) => normalizeKey(key)));

  for (const key of keys) {
    const direct = asScalarString(payload[key]);
    if (direct) {
      return direct;
    }
  }

  const stack: unknown[] = [...Object.values(payload)];
  const seen = new Set<object>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    const nested = asObject(current);
    if (!nested || seen.has(nested)) {
      continue;
    }
    seen.add(nested);

    for (const [entryKey, entryValue] of Object.entries(nested)) {
      if (keySet.has(normalizeKey(entryKey))) {
        const nestedValue = asScalarString(entryValue);
        if (nestedValue) {
          return nestedValue;
        }
      }

      stack.push(entryValue);
    }
  }

  return "";
};

export const parseCloverWebhook = (payload: unknown, rawBody: string): ParsedCloverWebhook => {
  const record = asObject(payload) || {};
  const eventType =
    pullNestedString(record, ["type", "eventType", "name", "event_name", "eventTypeName"]).toLowerCase() || "unknown";
  const eventId =
    pullNestedString(record, ["eventId", "webhookId", "event_id", "id"]) || createDeterministicHash(`${eventType}|${rawBody}`);
  const orderId = pullNestedString(record, [
    "orderId",
    "order_id",
    "externalReferenceId",
    "external_reference_id",
    "externalId",
    "orderReferenceId",
    "merchantOrderId",
  ]);
  const checkoutId = pullNestedString(record, [
    "checkoutId",
    "checkout_id",
    "checkoutSessionId",
    "checkout_session_id",
    "sessionId",
    "session_id",
  ]);
  const paymentReference = pullNestedString(record, [
    "paymentId",
    "payment_id",
    "transactionId",
    "transaction_id",
    "paymentReference",
    "referenceId",
    "checkoutId",
    "checkout_id",
    "sessionId",
    "session_id",
  ]);
  const status = pullNestedString(record, ["status", "paymentStatus", "payment_status", "state", "result"]).toLowerCase();
  const normalizedEventType = eventType.replace(/[\s-]+/g, "_");
  const normalizedStatus = status.replace(/[\s-]+/g, "_");

  const negativeStatuses = new Set(["unpaid", "failed", "failure", "canceled", "cancelled", "declined", "voided"]);
  const paidStatuses = new Set(["paid", "succeeded", "success", "completed", "captured", "settled"]);
  const paidEventNames = new Set([
    "paid",
    "payment_success",
    "payment.succeeded",
    "payment_succeeded",
    "checkout_paid",
    "charge.succeeded",
    "charge_succeeded",
  ]);

  const hasPaidStatus = paidStatuses.has(normalizedStatus) && !negativeStatuses.has(normalizedStatus);
  const hasPaidEventName =
    paidEventNames.has(normalizedEventType) ||
    /^payment[._]succeeded$/.test(normalizedEventType) ||
    /^charge[._]succeeded$/.test(normalizedEventType);
  const isPaidEvent = hasPaidEventName || hasPaidStatus;

  return {
    eventId,
    eventType,
    orderId,
    checkoutId,
    paymentReference,
    isPaidEvent,
  };
};
