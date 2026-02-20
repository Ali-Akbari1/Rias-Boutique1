import type { StoredOrder } from "./order-store.js";
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "./supabase-admin.js";

const isMemoryEmailLogEnabled = () => process.env.ORDER_STORE_ADAPTER?.trim().toLowerCase() === "memory";
const isCustomerOrderEmailEnabled = () => process.env.CUSTOMER_ORDER_EMAIL_ENABLED?.trim().toLowerCase() !== "false";
const formatMinorCad = (minor: number) => `CA$${(minor / 100).toFixed(2)}`;
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const safeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const toSingleLineAddress = (order: StoredOrder) =>
  `${order.customer.address}, ${order.customer.city}, ${order.customer.state}, ${order.customer.postalCode}, ${order.customer.country}`;
const formatLineItemsText = (order: StoredOrder) =>
  order.lineItems
    .map((item) => `- ${item.name} x${item.quantity} (${formatMinorCad(item.lineTotalMinor)})`)
    .join("\n");
const formatLineItemsHtml = (order: StoredOrder) =>
  order.lineItems
    .map(
      (item) =>
        `<li>${escapeHtml(item.name)} x${item.quantity} (${escapeHtml(formatMinorCad(item.lineTotalMinor))})</li>`,
    )
    .join("");

interface ResendDispatchInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface DispatchResult {
  provider: "resend" | "mock";
  status: "sent" | "queued";
  externalId: string;
}

interface OrderEmailMessage extends ResendDispatchInput {
  recipientType: "merchant" | "customer";
}

interface EmailDispatchRecord {
  recipientType: "merchant" | "customer";
  to: string;
  subject: string;
  provider: "resend" | "mock";
  status: "sent" | "queued" | "failed";
  externalId: string;
  error?: string;
  timestamp: string;
}

const sendWithResend = async ({ to, subject, text, html }: ResendDispatchInput): Promise<DispatchResult | null> => {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  if (!apiKey) {
    return null;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || "Ria's Boutique <orders@riasboutique.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Resend API failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string };
  return {
    provider: "resend",
    status: "sent",
    externalId: payload.id || "",
  };
};

const persistEmailLog = async ({ orderId, attempt }: { orderId: string; attempt: EmailDispatchRecord }) => {
  if (isMemoryEmailLogEnabled()) {
    return;
  }

  if (!hasSupabaseAdminConfig()) {
    console.warn("[email] skipping email log insert because Supabase is not configured", {
      orderId,
      recipientType: attempt.recipientType,
      to: attempt.to,
      status: attempt.status,
    });
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("email_logs").insert({
      order_id: orderId,
      to_email: attempt.to,
      subject: attempt.subject,
      payload_json: {
        orderId,
        recipientType: attempt.recipientType,
        to: attempt.to,
        subject: attempt.subject,
        provider: attempt.provider,
        status: attempt.status,
        externalId: attempt.externalId,
        error: attempt.error || "",
        timestamp: attempt.timestamp,
      },
      provider: attempt.provider,
      status: attempt.status,
      sent_at: attempt.timestamp,
    });

    if (error) {
      console.error("[email] failed to record email log", {
        orderId,
        recipientType: attempt.recipientType,
        to: attempt.to,
        status: attempt.status,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("[email] failed to persist email log", {
      orderId,
      recipientType: attempt.recipientType,
      to: attempt.to,
      status: attempt.status,
      error: safeErrorMessage(error),
    });
  }
};

export const sendOrderConfirmationEmail = async (order: StoredOrder) => {
  const merchantRecipient =
    process.env.MERCHANT_ORDER_EMAIL?.trim() || process.env.ORDER_ALERT_EMAIL?.trim() || order.customer.email;
  const customerRecipient = order.customer.email.trim();
  const deliveryMethod = order.customer.deliveryMethod === "pickup" ? "Pick up in store" : "Shipping";
  const fulfillmentText =
    order.customer.deliveryMethod === "pickup"
      ? "Pickup in store selected. Customer will collect from store."
      : `${order.customer.fullName}, ${order.customer.phone || "-"}, ${toSingleLineAddress(order)}`;

  const messages: OrderEmailMessage[] = [];

  messages.push({
    recipientType: "merchant",
    to: merchantRecipient,
    subject: `New Paid Order - ${order.id}`,
    text: [
      "A new order was paid on Ria's Boutique.",
      "",
      `Order ID: ${order.id}`,
      `Customer: ${order.customer.fullName} <${order.customer.email}>`,
      `Phone: ${order.customer.phone || "-"}`,
      `Fulfillment: ${deliveryMethod}`,
      `Shipping: ${fulfillmentText}`,
      `Total: ${formatMinorCad(order.totalMinor)}`,
      "",
      "Items:",
      formatLineItemsText(order),
    ].join("\n"),
    html: `
      <h2>New paid order</h2>
      <p><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
      <p><strong>Customer:</strong> ${escapeHtml(order.customer.fullName)} (${escapeHtml(order.customer.email)})</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.customer.phone || "-")}</p>
      <p><strong>Fulfillment:</strong> ${escapeHtml(deliveryMethod)}</p>
      <p><strong>Shipping:</strong> ${escapeHtml(fulfillmentText)}</p>
      <p><strong>Total:</strong> ${escapeHtml(formatMinorCad(order.totalMinor))}</p>
      <p><strong>Items:</strong></p>
      <ul>
        ${formatLineItemsHtml(order)}
      </ul>
    `,
  });

  if (isCustomerOrderEmailEnabled() && isLikelyEmail(customerRecipient)) {
    const customerFulfillmentText =
      order.customer.deliveryMethod === "pickup"
        ? "Pickup in store selected. We will contact you when your order is ready for collection."
        : `Shipping to ${toSingleLineAddress(order)}.`;

    messages.push({
      recipientType: "customer",
      to: customerRecipient,
      subject: `Order Confirmation - ${order.id}`,
      text: [
        `Thank you for your order with Ria's Boutique, ${order.customer.fullName}.`,
        "",
        `Order ID: ${order.id}`,
        `Fulfillment: ${deliveryMethod}`,
        customerFulfillmentText,
        `Total Paid: ${formatMinorCad(order.totalMinor)}`,
        "",
        "Items:",
        formatLineItemsText(order),
        "",
        "If you have any questions, reply to this email.",
      ].join("\n"),
      html: `
        <h2>Thank you for your order</h2>
        <p>Hi ${escapeHtml(order.customer.fullName)},</p>
        <p>We have received your payment for order <strong>${escapeHtml(order.id)}</strong>.</p>
        <p><strong>Fulfillment:</strong> ${escapeHtml(deliveryMethod)}</p>
        <p>${escapeHtml(customerFulfillmentText)}</p>
        <p><strong>Total Paid:</strong> ${escapeHtml(formatMinorCad(order.totalMinor))}</p>
        <p><strong>Items:</strong></p>
        <ul>
          ${formatLineItemsHtml(order)}
        </ul>
        <p>If you have any questions, reply to this email.</p>
      `,
    });
  }

  const attempts: EmailDispatchRecord[] = [];
  for (const message of messages) {
    const timestamp = new Date().toISOString();
    try {
      const dispatch = (await sendWithResend({
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })) || {
        provider: "mock" as const,
        status: "queued" as const,
        externalId: "",
      };

      const attempt: EmailDispatchRecord = {
        recipientType: message.recipientType,
        to: message.to,
        subject: message.subject,
        provider: dispatch.provider,
        status: dispatch.status,
        externalId: dispatch.externalId,
        timestamp,
      };
      attempts.push(attempt);
      await persistEmailLog({ orderId: order.id, attempt });
    } catch (error) {
      const attempt: EmailDispatchRecord = {
        recipientType: message.recipientType,
        to: message.to,
        subject: message.subject,
        provider: "resend",
        status: "failed",
        externalId: "",
        error: safeErrorMessage(error),
        timestamp,
      };
      attempts.push(attempt);
      await persistEmailLog({ orderId: order.id, attempt });
    }
  }

  if (!attempts.some((attempt) => attempt.status !== "failed")) {
    throw new Error(`All order notification emails failed for order ${order.id}.`);
  }

  console.log("[email] order notifications processed", {
    orderId: order.id,
    attempts: attempts.map((attempt) => ({
      recipientType: attempt.recipientType,
      to: attempt.to,
      status: attempt.status,
      provider: attempt.provider,
      error: attempt.error || "",
    })),
  });
};
