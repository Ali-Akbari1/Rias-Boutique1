import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { StoredOrder } from "./order-store";

const EMAIL_LOG_PATH = process.env.EMAIL_LOG_PATH?.trim() || path.resolve(process.cwd(), "data", "email-log.jsonl");

const ensureParentDirectory = (filePath: string) => {
  const parent = path.dirname(filePath);
  mkdirSync(parent, { recursive: true });
};

export const sendOrderConfirmationEmail = async (order: StoredOrder) => {
  const timestamp = new Date().toISOString();
  const payload = {
    timestamp,
    to: order.customer.email,
    subject: `Order Confirmation - ${order.id}`,
    orderId: order.id,
    totalMinor: order.totalMinor,
    currency: order.currency,
    itemCount: order.lineItems.length,
  };

  ensureParentDirectory(EMAIL_LOG_PATH);
  appendFileSync(EMAIL_LOG_PATH, `${JSON.stringify(payload)}\n`, "utf8");

  // Mock email transport for now. This can be replaced with SES/SendGrid provider integration.
  console.log(`[email] confirmation queued`, payload);
};
