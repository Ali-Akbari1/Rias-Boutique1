import type { StoredOrder } from "./order-store.js";
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "./supabase-admin.js";

const isMemoryEmailLogEnabled = () => process.env.ORDER_STORE_ADAPTER?.trim().toLowerCase() === "memory";

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

  if (!isMemoryEmailLogEnabled()) {
    if (!hasSupabaseAdminConfig()) {
      throw new Error("Supabase is not configured for confirmation email logging.");
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("email_logs").insert({
      order_id: order.id,
      to_email: order.customer.email,
      subject: payload.subject,
      payload_json: payload,
      provider: "mock",
      status: "queued",
      sent_at: timestamp,
    });

    if (error) {
      throw new Error(`Unable to record confirmation email log: ${error.message}`);
    }
  }

  // Mock email transport for now. Replace with Resend/SendGrid provider integration when ready.
  console.log("[email] confirmation queued", payload);
};
