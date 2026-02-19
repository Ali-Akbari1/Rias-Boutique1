import type { StoredOrder } from "./order-store.js";
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "./supabase-admin.js";

const isMemoryEmailLogEnabled = () => process.env.ORDER_STORE_ADAPTER?.trim().toLowerCase() === "memory";
const formatMinorCad = (minor: number) => `CA$${(minor / 100).toFixed(2)}`;
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

export const sendOrderConfirmationEmail = async (order: StoredOrder) => {
  const timestamp = new Date().toISOString();
  const merchantRecipient =
    process.env.MERCHANT_ORDER_EMAIL?.trim() || process.env.ORDER_ALERT_EMAIL?.trim() || order.customer.email;
  const itemLines = order.lineItems
    .map((item) => `- ${item.name} x${item.quantity} (${formatMinorCad(item.lineTotalMinor)})`)
    .join("\n");
  const subject = `New Paid Order - ${order.id}`;
  const deliveryMethod = order.customer.deliveryMethod === "pickup" ? "Pick up in store" : "Shipping";
  const shippingText =
    order.customer.deliveryMethod === "pickup"
      ? "Pickup in store selected. Customer will collect from store."
      : `${order.customer.fullName}, ${order.customer.phone || "-"}, ${order.customer.address}, ${order.customer.city}, ${order.customer.state}, ${order.customer.postalCode}, ${order.customer.country}`;
  const text = [
    "A new order was paid on Ria's Boutique.",
    "",
    `Order ID: ${order.id}`,
    `Customer: ${order.customer.fullName} <${order.customer.email}>`,
    `Phone: ${order.customer.phone}`,
    `Fulfillment: ${deliveryMethod}`,
    `Shipping: ${shippingText}`,
    `Total: ${formatMinorCad(order.totalMinor)}`,
    "",
    "Items:",
    itemLines,
  ].join("\n");
  const html = `
    <h2>New paid order</h2>
    <p><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
    <p><strong>Customer:</strong> ${escapeHtml(order.customer.fullName)} (${escapeHtml(order.customer.email)})</p>
    <p><strong>Phone:</strong> ${escapeHtml(order.customer.phone || "-")}</p>
    <p><strong>Fulfillment:</strong> ${escapeHtml(deliveryMethod)}</p>
    <p><strong>Shipping:</strong> ${escapeHtml(shippingText)}</p>
    <p><strong>Total:</strong> ${escapeHtml(formatMinorCad(order.totalMinor))}</p>
    <p><strong>Items:</strong></p>
    <ul>
      ${order.lineItems
        .map(
          (item) =>
            `<li>${escapeHtml(item.name)} x${item.quantity} (${escapeHtml(formatMinorCad(item.lineTotalMinor))})</li>`,
        )
        .join("")}
    </ul>
  `;

  const dispatch = (await sendWithResend({
    to: merchantRecipient,
    subject,
    text,
    html,
  })) || {
    provider: "mock" as const,
    status: "queued" as const,
    externalId: "",
  };

  const payload = {
    timestamp,
    to: merchantRecipient,
    subject,
    orderId: order.id,
    totalMinor: order.totalMinor,
    currency: order.currency,
    itemCount: order.lineItems.length,
    provider: dispatch.provider,
    status: dispatch.status,
  };

  if (!isMemoryEmailLogEnabled()) {
    if (!hasSupabaseAdminConfig()) {
      throw new Error("Supabase is not configured for confirmation email logging.");
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("email_logs").insert({
      order_id: order.id,
      to_email: merchantRecipient,
      subject: payload.subject,
      payload_json: payload,
      provider: dispatch.provider,
      status: dispatch.status,
      sent_at: timestamp,
    });

    if (error) {
      throw new Error(`Unable to record confirmation email log: ${error.message}`);
    }
  }

  console.log("[email] merchant alert queued", payload);
};
