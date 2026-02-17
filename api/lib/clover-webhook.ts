import { createDeterministicHash } from "./http";

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

const pullNestedString = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const direct = asString(payload[key]);
    if (direct) {
      return direct;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = asObject(value);
    if (!nested) {
      continue;
    }

    for (const key of keys) {
      const nestedValue = asString(nested[key]);
      if (nestedValue) {
        return nestedValue;
      }
    }
  }

  return "";
};

export const parseCloverWebhook = (payload: unknown, rawBody: string): ParsedCloverWebhook => {
  const record = asObject(payload) || {};
  const eventType = pullNestedString(record, ["type", "eventType", "name"]).toLowerCase() || "unknown";
  const eventId =
    pullNestedString(record, ["eventId", "id", "webhookId"]) || createDeterministicHash(`${eventType}|${rawBody}`);
  const orderId = pullNestedString(record, ["orderId", "externalReferenceId", "externalId"]);
  const checkoutId = pullNestedString(record, ["checkoutId", "checkoutSessionId", "sessionId", "paymentId"]);
  const paymentReference = pullNestedString(record, ["paymentId", "id", "transactionId", "checkoutId", "sessionId"]);
  const status = pullNestedString(record, ["status", "paymentStatus"]).toLowerCase();
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
