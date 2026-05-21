import type { StoredOrder } from "./order-store.js";
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "./supabase-admin.js";
import { logger } from "./logger.js";
import { fetchProviderJson } from "./provider-client.js";
import { buildCarrierTrackingUrl } from "./tracking.js";

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
const formatDateTime = (value: string) => {
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(asDate);
};
const toOrderNumber = (orderId: string) => {
  const normalized = orderId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (normalized.length >= 8) {
    return normalized.slice(-8);
  }
  return normalized || orderId.slice(0, 8).toUpperCase();
};
const cleanUrl = (value: string, fallback: string) => {
  const candidate = value.trim();
  if (!candidate) {
    return fallback;
  }
  try {
    return new URL(candidate).toString();
  } catch {
    return fallback;
  }
};
const toSingleLineAddress = (order: StoredOrder) =>
  `${order.customer.address}, ${order.customer.city}, ${order.customer.state}, ${order.customer.postalCode}, ${order.customer.country}`;
const formatLineItemDetails = (
  item: StoredOrder["lineItems"][number],
  { includeSku = false }: { includeSku?: boolean } = {},
) => {
  const parts: string[] = [];
  if (item.selection?.size) {
    parts.push(`Size: ${item.selection.size}`);
  }
  if (item.selection?.color) {
    parts.push(`Color: ${item.selection.color}`);
  }
  if (includeSku && item.productId) {
    parts.push(`SKU: ${item.productId}`);
  }

  if (parts.length > 0) {
    return parts.join(" • ");
  }

  return includeSku ? item.productId || "-" : "-";
};

const formatLineItemsText = (order: StoredOrder, { includeSku = false }: { includeSku?: boolean } = {}) =>
  order.lineItems
    .map((item) => {
      const details = formatLineItemDetails(item, { includeSku });
      const detailSuffix = details && details !== "-" ? ` (${details})` : "";
      return `- ${item.name}${detailSuffix} x${item.quantity} (${formatMinorCad(item.lineTotalMinor)})`;
    })
    .join("\n");

const formatLineItemsTableHtml = (order: StoredOrder, { includeSku = false }: { includeSku?: boolean } = {}) =>
  order.lineItems
    .map((item) => {
      const unitPrice = item.quantity > 0 ? Math.round(item.lineTotalMinor / item.quantity) : item.unitAmountMinor;
      const details = formatLineItemDetails(item, { includeSku });
      const imageHtml = item.imageUrl
        ? `<td style="padding-right:10px;">
             <img src="${escapeHtml(
               item.imageUrl,
             )}" alt="${escapeHtml(item.name)}" style="width:48px;height:48px;border-radius:6px;display:block;object-fit:cover;" />
           </td>`
        : "";
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #ececec;font-size:14px;color:#111827;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                ${imageHtml}
                <td style="font-size:14px;color:#111827;">${escapeHtml(item.name)}</td>
              </tr>
            </table>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #ececec;font-size:14px;color:#6b7280;">${escapeHtml(details)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ececec;font-size:14px;color:#111827;text-align:center;">${item.quantity}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ececec;font-size:14px;color:#111827;text-align:right;">${escapeHtml(
            formatMinorCad(unitPrice),
          )}</td>
        </tr>
      `;
    })
    .join("");
const getOrderPricing = (order: StoredOrder) => ({
  discountCode: order.pricing?.discountCode || "",
  discountMinor: order.pricing?.discountMinor || 0,
  shippingMinor: order.pricing?.shippingMinor || 0,
  quotedShippingMinor: order.pricing?.quotedShippingMinor || 0,
  taxMinor: order.pricing?.taxMinor || 0,
  freeShippingApplied: Boolean(order.pricing?.freeShippingApplied),
});
const getShippingLineLabel = (order: StoredOrder) => {
  if (order.customer.deliveryMethod === "pickup") {
    return "Pickup";
  }

  if (order.shipment?.carrier && order.shipment?.service) {
    return `${order.shipment.carrier} ${order.shipment.service}`;
  }

  if (order.shipment?.carrier) {
    return order.shipment.carrier;
  }

  if (order.shippingQuote?.carrier && order.shippingQuote?.service) {
    return `${order.shippingQuote.carrier} ${order.shippingQuote.service}`;
  }

  if (order.shippingQuote?.carrier) {
    return order.shippingQuote.carrier;
  }

  return "Shipping";
};
const resolveTrackingUrl = (order: StoredOrder) => {
  if (!order.shipment) {
    return "";
  }

  if (order.shipment.trackingUrl) {
    return order.shipment.trackingUrl;
  }

  return buildCarrierTrackingUrl({
    carrier: order.shipment.carrier,
    trackingCode: order.shipment.trackingCode,
  });
};
const buildTrackingText = (order: StoredOrder) => {
  if (!order.shipment || order.customer.deliveryMethod === "pickup") {
    return [];
  }

  const trackingUrl = resolveTrackingUrl(order);
  const lines = [
    `Carrier / Service: ${getShippingLineLabel(order)}`,
    `Tracking Number: ${order.shipment.trackingCode || "-"}`,
  ];

  if (trackingUrl) {
    lines.push(`Track your order: ${trackingUrl}`);
  }
  if (order.shipment.labelPdfUrl || order.shipment.labelUrl) {
    lines.push(`Label: ${order.shipment.labelPdfUrl || order.shipment.labelUrl}`);
  }

  return lines;
};
const buildTrackingHtml = ({
  order,
  includeLabelLink = false,
}: {
  order: StoredOrder;
  includeLabelLink?: boolean;
}) => {
  if (!order.shipment || order.customer.deliveryMethod === "pickup") {
    return "";
  }

  const labelUrl = order.shipment.labelPdfUrl || order.shipment.labelUrl;
  const trackingUrl = resolveTrackingUrl(order);

  return `
    <div style="padding:0 24px 20px 24px;">
      <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">Tracking</h2>
      <p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Carrier / Service:</strong> ${escapeHtml(
        getShippingLineLabel(order),
      )}</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Tracking Number:</strong> ${escapeHtml(
        order.shipment.trackingCode || "-",
      )}</p>
      ${
        trackingUrl
          ? `<p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;">
               <a href="${escapeHtml(trackingUrl)}" style="color:#111827;text-decoration:underline;">Track shipment</a>
             </p>`
          : ""
      }
      ${
        includeLabelLink && labelUrl
          ? `<p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;">
               <a href="${escapeHtml(labelUrl)}" style="color:#111827;text-decoration:underline;">Download shipping label</a>
             </p>`
          : ""
      }
    </div>
  `;
};

interface ResendDispatchInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

interface DispatchResult {
  provider: "resend" | "mock";
  status: "sent" | "queued";
  externalId: string;
}

export interface PromotionalEmailResult extends DispatchResult {
  recipient: string;
}

interface OrderEmailMessage extends ResendDispatchInput {
  recipientType: "merchant" | "customer" | "inquiry";
}

interface EmailDispatchRecord {
  recipientType: "merchant" | "customer" | "inquiry";
  to: string;
  subject: string;
  provider: "resend" | "mock";
  status: "sent" | "queued" | "failed";
  externalId: string;
  error?: string;
  timestamp: string;
}

const sendWithResend = async ({ to, subject, text, html, replyTo }: ResendDispatchInput): Promise<DispatchResult | null> => {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  if (!apiKey) {
    return null;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || "Ria's Boutique <orders@riasboutique.com>";
  const payload = await fetchProviderJson<{ id?: string }>({
    provider: "resend_email",
    url: "https://api.resend.com/emails",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      from: fromEmail,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      text,
    },
  });
  return {
    provider: "resend",
    status: "sent",
    externalId: payload.id || "",
  };
};

const persistEmailLog = async ({ orderId, attempt }: { orderId?: string; attempt: EmailDispatchRecord }) => {
  if (isMemoryEmailLogEnabled()) {
    return;
  }

  if (!hasSupabaseAdminConfig()) {
    logger.warn("email.log_insert_skipped", {
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
      order_id: orderId || null,
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
      logger.error("email.record_log_failed", {
        orderId,
        recipientType: attempt.recipientType,
        to: attempt.to,
        status: attempt.status,
        error: error.message,
      });
    }
  } catch (error) {
    logger.error("email.persist_log_failed", {
      orderId,
      recipientType: attempt.recipientType,
      to: attempt.to,
      status: attempt.status,
      error: safeErrorMessage(error),
    });
  }
};

export const sendWelcomeDiscountEmail = async ({
  to,
  fullName,
  code,
  expiresAtDisplay,
}: {
  to: string;
  fullName?: string;
  code: string;
  expiresAtDisplay: string;
}): Promise<PromotionalEmailResult> => {
  const recipient = to.trim().toLowerCase();
  if (!isLikelyEmail(recipient)) {
    throw new Error("A valid recipient email is required.");
  }

  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new Error("Promotional email is not configured. Set RESEND_API_KEY.");
  }

  const brandName = process.env.STORE_BRAND_NAME?.trim() || "Ria's Boutique";
  const websiteUrl = cleanUrl(process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "", "https://www.riasboutique.com");
  const logoUrl = cleanUrl(process.env.EMAIL_LOGO_URL?.trim() || "", `${websiteUrl.replace(/\/+$/, "")}/RAb.png`);
  const explicitReplyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim() || "";
  const fallbackReplyTo = process.env.MERCHANT_ORDER_EMAIL?.trim() || "";
  const replyTo = isLikelyEmail(explicitReplyTo)
    ? explicitReplyTo
    : isLikelyEmail(fallbackReplyTo)
      ? fallbackReplyTo
      : "";
  const greetingName = fullName?.trim() || "there";
  const hasExpiry = Boolean(expiresAtDisplay.trim());
  const subject = `${brandName} Welcome Offer - 10% Off Your First Order`;
  const text = [
    `Hi ${greetingName},`,
    "",
    `Thanks for joining ${brandName}. Enjoy 10% off your first order with code ${code}.`,
    "This welcome offer is reserved for email subscribers placing their first order.",
    ...(hasExpiry ? [`Offer valid until ${expiresAtDisplay}.`] : []),
    "",
    `Start shopping: ${websiteUrl.replace(/\/+$/, "")}/collection`,
    "",
    "Use the same email address at checkout so we can verify your eligibility.",
    "",
    `Need help? Reply to this email${replyTo ? ` or contact ${replyTo}` : ""}.`,
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border:1px solid #ececec;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:24px 24px 12px 24px;border-bottom:1px solid #ececec;background:#ffffff;text-align:center;">
                  <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="height:42px;display:block;margin:0 auto 12px;" />
                  <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(
                    brandName,
                  )}</p>
                  <h1 style="margin:10px 0 0 0;font-size:34px;line-height:1.15;color:#111827;">Enjoy 10% Off</h1>
                  <p style="margin:8px 0 0 0;font-size:15px;color:#4b5563;">Use your welcome code below for 10% off your first order.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 24px;text-align:center;">
                  <div style="display:inline-block;padding:10px 20px;border:1px dashed #111827;border-radius:8px;font-size:26px;letter-spacing:0.08em;font-weight:700;color:#111827;">
                    ${escapeHtml(code)}
                  </div>
                  <p style="margin:14px 0 0 0;font-size:14px;color:#6b7280;">Reserved for email subscribers on their first order.</p>
                  ${
                    hasExpiry
                      ? `<p style="margin:8px 0 0 0;font-size:14px;color:#6b7280;">Valid until ${escapeHtml(expiresAtDisplay)}</p>`
                      : ""
                  }
                  <p style="margin:8px 0 0 0;font-size:14px;color:#4b5563;">Use the same email address at checkout to apply it.</p>
                  <p style="margin:18px 0 0 0;">
                    <a href="${escapeHtml(
                      `${websiteUrl.replace(/\/+$/, "")}/collection`,
                    )}" style="display:inline-block;padding:11px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">
                      Shop the Collection
                    </a>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 24px;border-top:1px solid #ececec;background:#fafafa;text-align:center;">
                  <p style="margin:0;font-size:13px;color:#6b7280;">If you have questions, reply to this email.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const timestamp = new Date().toISOString();
  try {
    const dispatch = await sendWithResend({
      to: recipient,
      subject,
      text,
      html,
      replyTo,
    });

    if (!dispatch) {
      throw new Error("Promotional email could not be sent because Resend is not configured.");
    }

    await persistEmailLog({
      attempt: {
        recipientType: "customer",
        to: recipient,
        subject,
        provider: dispatch.provider,
        status: dispatch.status,
        externalId: dispatch.externalId,
        timestamp,
      },
    });

    return {
      ...dispatch,
      recipient,
    };
  } catch (error) {
    await persistEmailLog({
      attempt: {
        recipientType: "customer",
        to: recipient,
        subject,
        provider: "resend",
        status: "failed",
        externalId: "",
        error: safeErrorMessage(error),
        timestamp,
      },
    });
    throw error;
  }
};

export const sendProductInquiryEmail = async ({
  productId,
  productName,
  productSku,
  productUrl,
  selectedVariant,
  fullName,
  email,
  phone,
  location,
  requiredByDate,
  occasion,
  sizeNotes,
  message,
}: {
  productId: string;
  productName: string;
  productSku?: string;
  productUrl: string;
  selectedVariant?: string;
  fullName: string;
  email: string;
  phone?: string;
  location: string;
  requiredByDate: string;
  occasion?: string;
  sizeNotes?: string;
  message: string;
}): Promise<PromotionalEmailResult> => {
  const merchantRecipient =
    process.env.MERCHANT_ORDER_EMAIL?.trim() || process.env.ORDER_ALERT_EMAIL?.trim() || "";
  if (!isLikelyEmail(merchantRecipient)) {
    throw new Error("Product inquiry email recipient is not configured.");
  }

  const customerEmail = email.trim().toLowerCase();
  if (!isLikelyEmail(customerEmail)) {
    throw new Error("A valid customer email is required.");
  }

  const brandName = process.env.STORE_BRAND_NAME?.trim() || "Ria's Boutique";
  const websiteUrl = cleanUrl(process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "", "https://www.riasboutique.com");
  const logoUrl = cleanUrl(process.env.EMAIL_LOGO_URL?.trim() || "", `${websiteUrl.replace(/\/+$/, "")}/RAb.png`);
  const productLink = cleanUrl(productUrl, `${websiteUrl.replace(/\/+$/, "")}/collection`);
  const trimmedVariant = selectedVariant?.trim() || "Not selected";
  const trimmedPhone = phone?.trim() || "-";
  const trimmedOccasion = occasion?.trim() || "-";
  const trimmedSizeNotes = sizeNotes?.trim() || "-";
  const trimmedSku = productSku?.trim() || productId.trim() || "-";
  const subject = `New inquiry: ${productName.trim() || "Product inquiry"}`;
  const text = [
    `New inquiry received for ${productName.trim()}.`,
    "",
    `Customer: ${fullName.trim()}`,
    `Email: ${customerEmail}`,
    `Phone: ${trimmedPhone}`,
    `Location: ${location.trim()}`,
    `Required By: ${requiredByDate.trim()}`,
    `Occasion: ${trimmedOccasion}`,
    `Size / Measurements: ${trimmedSizeNotes}`,
    "",
    `Product: ${productName.trim()}`,
    `SKU: ${trimmedSku}`,
    `Selected Variant: ${trimmedVariant}`,
    `Product URL: ${productLink}`,
    "",
    "Message:",
    message.trim(),
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #ececec;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:24px 24px 16px 24px;border-bottom:1px solid #ececec;background:#ffffff;">
                  <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="height:34px;display:block;margin-bottom:12px;" />
                  <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(
                    brandName,
                  )}</p>
                  <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:1.25;color:#111827;">New product inquiry</h1>
                  <p style="margin:0;font-size:15px;color:#4b5563;">A shopper has requested pricing and availability details.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px 8px 24px;">
                  <h2 style="margin:0 0 10px 0;font-size:18px;color:#111827;">Customer</h2>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Name</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(fullName.trim())}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Email</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;"><a href="mailto:${escapeHtml(
                        customerEmail,
                      )}" style="color:#111827;text-decoration:underline;">${escapeHtml(customerEmail)}</a></td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Phone</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(trimmedPhone)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Location</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(location.trim())}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Required By</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(requiredByDate.trim())}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Occasion</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(trimmedOccasion)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Size / Measurements</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(trimmedSizeNotes)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 24px 8px 24px;">
                  <h2 style="margin:0 0 10px 0;font-size:18px;color:#111827;">Product</h2>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Product</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(productName.trim())}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">SKU</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(trimmedSku)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Selected Variant</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(trimmedVariant)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;">Product URL</td>
                      <td align="right" style="padding:6px 0;font-size:14px;color:#111827;"><a href="${escapeHtml(
                        productLink,
                      )}" style="color:#111827;text-decoration:underline;">Open product</a></td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 24px 24px 24px;">
                  <h2 style="margin:0 0 10px 0;font-size:18px;color:#111827;">Message</h2>
                  <div style="border:1px solid #ececec;border-radius:8px;padding:14px;background:#fafafa;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${escapeHtml(
                    message.trim(),
                  )}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const timestamp = new Date().toISOString();
  try {
    const dispatch = (await sendWithResend({
      to: merchantRecipient,
      subject,
      text,
      html,
      replyTo: customerEmail,
    })) || {
      provider: "mock" as const,
      status: "queued" as const,
      externalId: "",
    };

    await persistEmailLog({
      attempt: {
        recipientType: "inquiry",
        to: merchantRecipient,
        subject,
        provider: dispatch.provider,
        status: dispatch.status,
        externalId: dispatch.externalId,
        timestamp,
      },
    });

    return {
      ...dispatch,
      recipient: merchantRecipient,
    };
  } catch (error) {
    await persistEmailLog({
      attempt: {
        recipientType: "inquiry",
        to: merchantRecipient,
        subject,
        provider: "resend",
        status: "failed",
        externalId: "",
        error: safeErrorMessage(error),
        timestamp,
      },
    });
    throw error;
  }
};

export const sendLaunchDiscountEmail = sendWelcomeDiscountEmail;

export const sendTrackingEmail = async (order: StoredOrder) => {
  if (order.customer.deliveryMethod === "pickup") {
    throw new Error("Pickup orders do not require tracking emails.");
  }

  if (!order.shipment || (!order.shipment.trackingCode && !order.shipment.trackingUrl)) {
    throw new Error("Tracking information is not available yet.");
  }

  const recipient = order.customer.email.trim();
  if (!isLikelyEmail(recipient)) {
    throw new Error("A valid recipient email is required.");
  }

  const merchantRecipient =
    process.env.MERCHANT_ORDER_EMAIL?.trim() || process.env.ORDER_ALERT_EMAIL?.trim() || "";
  const explicitReplyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim() || "";
  const replyToRecipient = isLikelyEmail(explicitReplyTo)
    ? explicitReplyTo
    : isLikelyEmail(merchantRecipient)
      ? merchantRecipient
      : "";
  const brandName = process.env.STORE_BRAND_NAME?.trim() || "Ria's Boutique";
  const supportEmail = isLikelyEmail((process.env.SUPPORT_EMAIL || "").trim())
    ? (process.env.SUPPORT_EMAIL || "").trim()
    : replyToRecipient;
  const websiteUrl = cleanUrl(process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "", "https://www.riasboutique.com");
  const logoUrl = cleanUrl(process.env.EMAIL_LOGO_URL?.trim() || "", "");
  const orderNumber = toOrderNumber(order.id);
  const greetingName = order.customer.fullName?.trim() || "there";
  const pricing = getOrderPricing(order);
  const shippingAddress = toSingleLineAddress(order);
  const trackingLines = buildTrackingText(order);
  const trackingUrl = resolveTrackingUrl(order);
  const trackingNote = "Tracking updates may take 24-48 hours to appear.";
  const trackingVariantLabel = order.lineItems.some((item) => item.selection?.size || item.selection?.color)
    ? "Size / Color"
    : "Details";
  const orderSummaryTable = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #ececec;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th align="left" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Item</th>
          <th align="left" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(
            trackingVariantLabel,
          )}</th>
          <th align="center" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Qty</th>
          <th align="right" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${formatLineItemsTableHtml(order)}
      </tbody>
    </table>
  `;
  const orderTotalsTable = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Subtotal</td>
        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
          formatMinorCad(order.subtotalMinor),
        )}</td>
      </tr>
      ${
        pricing.discountMinor > 0
          ? `<tr>
               <td style="padding:6px 0;font-size:14px;color:#6b7280;">Discount${
                 pricing.discountCode ? ` (${escapeHtml(pricing.discountCode)})` : ""
               }</td>
               <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">-${escapeHtml(
                 formatMinorCad(pricing.discountMinor),
               )}</td>
             </tr>`
          : ""
      }
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Shipping</td>
        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
          formatMinorCad(pricing.shippingMinor),
        )}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Tax</td>
        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
          formatMinorCad(pricing.taxMinor),
        )}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #ececec;">Total</td>
        <td align="right" style="padding:10px 0 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #ececec;">${escapeHtml(
          formatMinorCad(order.totalMinor),
        )}</td>
      </tr>
    </table>
  `;

  const subject = `${brandName} - Your order is on the way (Order #${orderNumber})`;
  const text = [
    `Hi ${greetingName},`,
    "",
    "Thank you for your order! Your shipment is on the way.",
    "",
    `Order Number: ${orderNumber}`,
    shippingAddress ? `Shipping to: ${shippingAddress}` : "",
    "Items:",
    formatLineItemsText(order),
    "",
    `Subtotal: ${formatMinorCad(order.subtotalMinor)}`,
    pricing.discountMinor > 0
      ? `Discount${pricing.discountCode ? ` (${pricing.discountCode})` : ""}: -${formatMinorCad(
          pricing.discountMinor,
        )}`
      : "",
    `Shipping: ${formatMinorCad(pricing.shippingMinor)}`,
    `Tax: ${formatMinorCad(pricing.taxMinor)}`,
    `Total: ${formatMinorCad(order.totalMinor)}`,
    "",
    ...trackingLines,
    trackingNote,
    "",
    `Need help? Reply to this email${supportEmail ? ` or contact ${supportEmail}` : ""}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border:1px solid #ececec;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:24px 24px 16px 24px;border-bottom:1px solid #ececec;background:#ffffff;">
                  ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="height:34px;display:block;margin-bottom:12px;" />` : ""}
                  <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(
                    brandName,
                  )}</p>
                  <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:1.25;color:#111827;">Your order is on the way</h1>
                  <p style="margin:0;font-size:15px;color:#4b5563;">Thank you for your order! Order #${escapeHtml(
                    orderNumber,
                  )}</p>
                  ${
                    shippingAddress
                      ? `<p style="margin:8px 0 0 0;font-size:14px;color:#4b5563;"><strong>Shipping to:</strong> ${escapeHtml(
                          shippingAddress,
                        )}</p>`
                      : ""
                  }
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px 8px 24px;">
                  <h2 style="margin:0 0 10px 0;font-size:18px;color:#111827;">Order Summary</h2>
                  ${orderSummaryTable}
                  ${orderTotalsTable}
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 20px 24px;">
                  <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">Tracking</h2>
                  <p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Carrier / Service:</strong> ${escapeHtml(
                    getShippingLineLabel(order),
                  )}</p>
                  <p style="margin:0 0 10px 0;font-size:14px;color:#4b5563;"><strong>Tracking Number:</strong> ${escapeHtml(
                    order.shipment?.trackingCode || "-",
                  )}</p>
                  ${
                    trackingUrl
                      ? `<p style="margin:0 0 12px 0;">
                           <a href="${escapeHtml(
                             trackingUrl,
                           )}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">
                             Track your shipment
                           </a>
                         </p>
                         <p style="margin:0 0 12px 0;font-size:12px;color:#6b7280;">${escapeHtml(trackingNote)}</p>
                         <p style="margin:0;font-size:12px;color:#6b7280;">Or use this link: <a href="${escapeHtml(
                           trackingUrl,
                         )}" style="color:#111827;text-decoration:underline;">${escapeHtml(trackingUrl)}</a></p>`
                      : ""
                  }
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 20px 24px;">
                  <p style="margin:0;font-size:14px;color:#4b5563;">
                    Need help?
                    ${
                      supportEmail
                        ? ` Reply to this email or contact us at <a href="mailto:${escapeHtml(
                            supportEmail,
                          )}" style="color:#111827;text-decoration:underline;">${escapeHtml(supportEmail)}</a>.`
                        : " Reply to this email and our team will help you."
                    }
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px;border-top:1px solid #ececec;background:#fafafa;">
                  <p style="margin:0;font-size:13px;color:#6b7280;">
                    <a href="${escapeHtml(websiteUrl)}" style="color:#111827;text-decoration:underline;">Visit ${escapeHtml(
                      brandName,
                    )}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const merchantSubject = `${brandName} - Tracking update (Order #${orderNumber})`;
  const merchantText = [
    `Tracking update for Order #${orderNumber}.`,
    "",
    `Customer: ${order.customer.fullName} <${order.customer.email}>`,
    `Shipping to: ${shippingAddress}`,
    "",
    "Items:",
    formatLineItemsText(order, { includeSku: true }),
    "",
    `Subtotal: ${formatMinorCad(order.subtotalMinor)}`,
    pricing.discountMinor > 0
      ? `Discount${pricing.discountCode ? ` (${pricing.discountCode})` : ""}: -${formatMinorCad(
          pricing.discountMinor,
        )}`
      : "",
    `Shipping: ${formatMinorCad(pricing.shippingMinor)}`,
    `Tax: ${formatMinorCad(pricing.taxMinor)}`,
    `Total: ${formatMinorCad(order.totalMinor)}`,
    "",
    ...trackingLines,
    trackingNote,
    "",
    `Admin: ${websiteUrl.replace(/\/+$/, "")}/orders-admin`,
  ]
    .filter(Boolean)
    .join("\n");

  const merchantHtml = `
    <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border:1px solid #ececec;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:24px 24px 16px 24px;border-bottom:1px solid #ececec;background:#ffffff;">
                  ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="height:34px;display:block;margin-bottom:12px;" />` : ""}
                  <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(
                    brandName,
                  )}</p>
                  <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:1.25;color:#111827;">Tracking update</h1>
                  <p style="margin:0;font-size:15px;color:#4b5563;">Order #${escapeHtml(
                    orderNumber,
                  )} for ${escapeHtml(order.customer.fullName || "customer")}</p>
                  <p style="margin:8px 0 0 0;font-size:14px;color:#4b5563;"><strong>Shipping to:</strong> ${escapeHtml(
                    shippingAddress,
                  )}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px 8px 24px;">
                  <h2 style="margin:0 0 10px 0;font-size:18px;color:#111827;">Order Summary</h2>
                  ${orderSummaryTable}
                  ${orderTotalsTable}
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 20px 24px;">
                  <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">Tracking</h2>
                  <p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Carrier / Service:</strong> ${escapeHtml(
                    getShippingLineLabel(order),
                  )}</p>
                  <p style="margin:0 0 10px 0;font-size:14px;color:#4b5563;"><strong>Tracking Number:</strong> ${escapeHtml(
                    order.shipment?.trackingCode || "-",
                  )}</p>
                  ${
                    trackingUrl
                      ? `<p style="margin:0 0 12px 0;">
                           <a href="${escapeHtml(
                             trackingUrl,
                           )}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">
                             Track your shipment
                           </a>
                         </p>
                         <p style="margin:0 0 12px 0;font-size:12px;color:#6b7280;">${escapeHtml(trackingNote)}</p>
                         <p style="margin:0;font-size:12px;color:#6b7280;">Or use this link: <a href="${escapeHtml(
                           trackingUrl,
                         )}" style="color:#111827;text-decoration:underline;">${escapeHtml(trackingUrl)}</a></p>`
                      : ""
                  }
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px;border-top:1px solid #ececec;background:#fafafa;">
                  <p style="margin:0;font-size:13px;color:#6b7280;">
                    <a href="${escapeHtml(
                      `${websiteUrl.replace(/\/+$/, "")}/orders-admin`,
                    )}" style="color:#111827;text-decoration:underline;">Open Orders Dashboard</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const timestamp = new Date().toISOString();

  try {
    const dispatch = (await sendWithResend({
      to: recipient,
      subject,
      text,
      html,
      replyTo: replyToRecipient,
    })) || {
      provider: "mock" as const,
      status: "queued" as const,
      externalId: "",
    };

    await persistEmailLog({
      orderId: order.id,
      attempt: {
        recipientType: "customer",
        to: recipient,
        subject,
        provider: dispatch.provider,
        status: dispatch.status,
        externalId: dispatch.externalId,
        timestamp,
      },
    });

    if (isLikelyEmail(merchantRecipient) && merchantRecipient !== recipient) {
      try {
        const merchantDispatch = (await sendWithResend({
          to: merchantRecipient,
          subject: merchantSubject,
          text: merchantText,
          html: merchantHtml,
          replyTo: replyToRecipient,
        })) || {
          provider: "mock" as const,
          status: "queued" as const,
          externalId: "",
        };

        await persistEmailLog({
          orderId: order.id,
          attempt: {
            recipientType: "merchant",
            to: merchantRecipient,
            subject: merchantSubject,
            provider: merchantDispatch.provider,
            status: merchantDispatch.status,
            externalId: merchantDispatch.externalId,
            timestamp,
          },
        });
      } catch (error) {
        await persistEmailLog({
          orderId: order.id,
          attempt: {
            recipientType: "merchant",
            to: merchantRecipient,
            subject: merchantSubject,
            provider: "resend",
            status: "failed",
            externalId: "",
            error: safeErrorMessage(error),
            timestamp,
          },
        });
      }
    }

    return dispatch;
  } catch (error) {
    await persistEmailLog({
      orderId: order.id,
      attempt: {
        recipientType: "customer",
        to: recipient,
        subject,
        provider: "resend",
        status: "failed",
        externalId: "",
        error: safeErrorMessage(error),
        timestamp,
      },
    });
    throw error;
  }
};

export const sendPickupReadyEmail = async (order: StoredOrder): Promise<DispatchResult> => {
  if (order.customer.deliveryMethod !== "pickup") {
    throw new Error("Pickup-ready emails can only be sent for pickup orders.");
  }

  const recipient = order.customer.email.trim();
  if (!isLikelyEmail(recipient)) {
    throw new Error("A valid recipient email is required.");
  }

  const merchantRecipient =
    process.env.MERCHANT_ORDER_EMAIL?.trim() || process.env.ORDER_ALERT_EMAIL?.trim() || "";
  const explicitReplyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim() || "";
  const replyToRecipient = isLikelyEmail(explicitReplyTo)
    ? explicitReplyTo
    : isLikelyEmail(merchantRecipient)
      ? merchantRecipient
      : "";
  const brandName = process.env.STORE_BRAND_NAME?.trim() || "Ria's Boutique";
  const supportEmail = isLikelyEmail((process.env.SUPPORT_EMAIL || "").trim())
    ? (process.env.SUPPORT_EMAIL || "").trim()
    : replyToRecipient;
  const websiteUrl = cleanUrl(process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "", "https://www.riasboutique.com");
  const logoUrl = cleanUrl(process.env.EMAIL_LOGO_URL?.trim() || "", "");
  const storeLocation = process.env.STORE_LOCATION_DISPLAY?.trim() || "Calgary, AB";
  const pickupAddress =
    process.env.VITE_STORE_PICKUP_ADDRESS?.trim() || "260300 Writing Creek Cres Floor 1, Unit H31, Balzac, AB T4A 0X8";
  const pickupHours = process.env.VITE_STORE_PICKUP_HOURS?.trim() || "Regular store hours are 11:00 AM - 6:00 PM.";
  const orderNumber = toOrderNumber(order.id);
  const greetingName = order.customer.fullName?.trim() || "there";
  const pricing = getOrderPricing(order);
  const variantLabel = order.lineItems.some((item) => item.selection?.size || item.selection?.color)
    ? "Size / Color"
    : "Details";
  const orderSummaryTable = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #ececec;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th align="left" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Item</th>
          <th align="left" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(
            variantLabel,
          )}</th>
          <th align="center" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Qty</th>
          <th align="right" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${formatLineItemsTableHtml(order)}
      </tbody>
    </table>
  `;
  const totalsTable = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Subtotal</td>
        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
          formatMinorCad(order.subtotalMinor),
        )}</td>
      </tr>
      ${
        pricing.discountMinor > 0
          ? `<tr>
               <td style="padding:6px 0;font-size:14px;color:#6b7280;">Discount${
                 pricing.discountCode ? ` (${escapeHtml(pricing.discountCode)})` : ""
               }</td>
               <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">-${escapeHtml(
                 formatMinorCad(pricing.discountMinor),
               )}</td>
             </tr>`
          : ""
      }
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Pickup</td>
        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">In store</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Tax</td>
        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
          formatMinorCad(pricing.taxMinor),
        )}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #ececec;">Total</td>
        <td align="right" style="padding:10px 0 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #ececec;">${escapeHtml(
          formatMinorCad(order.totalMinor),
        )}</td>
      </tr>
    </table>
  `;
  const supportLine = supportEmail ? `reply to this email or contact ${supportEmail}` : "reply to this email";
  const subject = `${brandName} - Your order is ready for pickup (Order #${orderNumber})`;
  const text = [
    `Hi ${greetingName},`,
    "",
    "Good news! Your order is ready to be picked up in store.",
    "",
    `Order Number: ${orderNumber}`,
    `Pickup Address: ${pickupAddress}`,
    `Store Hours: ${pickupHours}`,
    "",
    "Please bring your order confirmation email when you arrive.",
    "",
    "Items:",
    formatLineItemsText(order),
    "",
    `Subtotal: ${formatMinorCad(order.subtotalMinor)}`,
    pricing.discountMinor > 0 ? `Discount${pricing.discountCode ? ` (${pricing.discountCode})` : ""}: -${formatMinorCad(pricing.discountMinor)}` : "",
    "Pickup: In store",
    `Tax: ${formatMinorCad(pricing.taxMinor)}`,
    `Total: ${formatMinorCad(order.totalMinor)}`,
    "",
    `Questions? Please ${supportLine}.`,
    `${brandName} | ${storeLocation}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #ececec;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:24px 24px 16px 24px;border-bottom:1px solid #ececec;background:#ffffff;">
                  ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="height:34px;display:block;margin-bottom:12px;" />` : ""}
                  <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(
                    brandName,
                  )}</p>
                  <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:1.25;color:#111827;">Your order is ready for pickup</h1>
                  <p style="margin:0;font-size:15px;color:#4b5563;">Hi ${escapeHtml(
                    greetingName,
                  )}, your order #${escapeHtml(orderNumber)} is ready.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                    <tr>
                      <td style="padding:4px 0;font-size:14px;color:#6b7280;">Pickup Address</td>
                      <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">${escapeHtml(pickupAddress)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:14px;color:#6b7280;">Store Hours</td>
                      <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">${escapeHtml(pickupHours)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:14px;color:#6b7280;">Order Number</td>
                      <td align="right" style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;">#${escapeHtml(
                        orderNumber,
                      )}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 20px 24px;">
                  <div style="padding:14px 16px;border:1px solid #ececec;border-radius:8px;background:#fafafa;">
                    <p style="margin:0;font-size:14px;color:#4b5563;">Please bring your order confirmation email when you arrive. If someone else is picking up for you, reply to this email and let us know their name.</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 20px 24px;">
                  <h2 style="margin:0 0 10px 0;font-size:18px;color:#111827;">Order Summary</h2>
                  ${orderSummaryTable}
                  ${totalsTable}
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 20px 24px;">
                  <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">Need help?</h2>
                  <p style="margin:0;font-size:14px;color:#4b5563;">
                    ${
                      supportEmail
                        ? `Reply to this email or contact us at <a href="mailto:${escapeHtml(
                            supportEmail,
                          )}" style="color:#111827;text-decoration:underline;">${escapeHtml(supportEmail)}</a>.`
                        : "Reply to this email and our team will help you."
                    }
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px;border-top:1px solid #ececec;background:#fafafa;">
                  <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;">${escapeHtml(brandName)} | ${escapeHtml(
                    storeLocation,
                  )}</p>
                  <p style="margin:0;font-size:13px;color:#6b7280;">
                    <a href="${escapeHtml(websiteUrl)}" style="color:#111827;text-decoration:underline;">Website</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
  const timestamp = new Date().toISOString();

  try {
    const dispatch = (await sendWithResend({
      to: recipient,
      subject,
      text,
      html,
      replyTo: replyToRecipient,
    })) || {
      provider: "mock" as const,
      status: "queued" as const,
      externalId: "",
    };

    await persistEmailLog({
      orderId: order.id,
      attempt: {
        recipientType: "customer",
        to: recipient,
        subject,
        provider: dispatch.provider,
        status: dispatch.status,
        externalId: dispatch.externalId,
        timestamp,
      },
    });

    return dispatch;
  } catch (error) {
    await persistEmailLog({
      orderId: order.id,
      attempt: {
        recipientType: "customer",
        to: recipient,
        subject,
        provider: "resend",
        status: "failed",
        externalId: "",
        error: safeErrorMessage(error),
        timestamp,
      },
    });
    throw error;
  }
};

export const sendOrderConfirmationEmail = async (order: StoredOrder) => {
  const merchantRecipient =
    process.env.MERCHANT_ORDER_EMAIL?.trim() || process.env.ORDER_ALERT_EMAIL?.trim() || order.customer.email;
  const customerRecipient = order.customer.email.trim();
  const explicitReplyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim() || "";
  const replyToRecipient = isLikelyEmail(explicitReplyTo)
    ? explicitReplyTo
    : isLikelyEmail(merchantRecipient)
      ? merchantRecipient
      : "";
  const brandName = process.env.STORE_BRAND_NAME?.trim() || "Ria's Boutique";
  const supportEmail = isLikelyEmail((process.env.SUPPORT_EMAIL || "").trim())
    ? (process.env.SUPPORT_EMAIL || "").trim()
    : replyToRecipient;
  const websiteUrl = cleanUrl(process.env.CLOVER_CHECKOUT_BASE_URL?.trim() || "", "https://www.riasboutique.com");
  const instagramUrl = cleanUrl(
    process.env.VITE_INSTAGRAM_PROFILE_URL?.trim() || "",
    "https://www.instagram.com/riasboutique__",
  );
  const logoUrl = cleanUrl(process.env.EMAIL_LOGO_URL?.trim() || "", "");
  const storeLocation = process.env.STORE_LOCATION_DISPLAY?.trim() || "Calgary, AB";
  const pickupAddress =
    process.env.VITE_STORE_PICKUP_ADDRESS?.trim() || "260300 Writing Creek Cres Floor 1, Unit H31, Balzac, AB T4A 0X8";
  const pickupHours = process.env.VITE_STORE_PICKUP_HOURS?.trim() || "Regular store hours are 11:00 AM - 6:00 PM.";
  const orderNumber = toOrderNumber(order.id);
  const orderDate = formatDateTime(order.createdAt || new Date().toISOString());
  const deliveryMethod = order.customer.deliveryMethod === "pickup" ? "Pick up in store" : "Shipping";
  const pricing = getOrderPricing(order);
  const merchantVariantLabel = "Details";
  const customerVariantLabel = order.lineItems.some((item) => item.selection?.size || item.selection?.color)
    ? "Size / Color"
    : "Details";

  const messages: OrderEmailMessage[] = [];

  const merchantSummaryTable = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #ececec;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th align="left" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Item</th>
          <th align="left" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(
            merchantVariantLabel,
          )}</th>
          <th align="center" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Qty</th>
          <th align="right" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${formatLineItemsTableHtml(order, { includeSku: true })}
      </tbody>
    </table>
  `;

  messages.push({
    recipientType: "merchant",
    to: merchantRecipient,
    subject: `New Paid Order - ${brandName} (Order #${orderNumber})`,
    text: [
      `New paid order received for ${brandName}.`,
      "",
      `Order Number: ${orderNumber}`,
      `Order Date: ${orderDate}`,
      `Payment Method: Clover hosted checkout`,
      "",
      `Customer: ${order.customer.fullName} <${order.customer.email}>`,
      `Phone: ${order.customer.phone || "-"}`,
      `Fulfillment: ${deliveryMethod}`,
      order.customer.deliveryMethod === "pickup"
        ? `Pickup Address: ${pickupAddress}`
        : `Shipping Address: ${toSingleLineAddress(order)}`,
      `Total: ${formatMinorCad(order.totalMinor)}`,
      "",
      "Items:",
      formatLineItemsText(order, { includeSku: true }),
      "",
      `Subtotal: ${formatMinorCad(order.subtotalMinor)}`,
      pricing.discountMinor > 0 ? `Discount${pricing.discountCode ? ` (${pricing.discountCode})` : ""}: -${formatMinorCad(pricing.discountMinor)}` : "",
      `Shipping: ${order.customer.deliveryMethod === "pickup" ? "Pickup in store" : formatMinorCad(pricing.shippingMinor)}`,
      `Tax: ${formatMinorCad(pricing.taxMinor)}`,
      `Total: ${formatMinorCad(order.totalMinor)}`,
      ...buildTrackingText(order),
      "",
      `Admin: ${websiteUrl.replace(/\/+$/, "")}/orders-admin`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#111827;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #ececec;border-radius:10px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 24px 16px 24px;border-bottom:1px solid #ececec;background:#ffffff;">
                    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="height:34px;display:block;margin-bottom:12px;" />` : ""}
                    <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(
                      brandName,
                    )}</p>
                    <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:1.25;color:#111827;">New paid order received</h1>
                    <p style="margin:0;font-size:15px;color:#4b5563;">A customer has completed checkout. Review and process this order.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;">Order Number</td>
                        <td align="right" style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;">#${escapeHtml(
                          orderNumber,
                        )}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;">Order Date</td>
                        <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">${escapeHtml(orderDate)}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;">Payment Method</td>
                        <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">Clover hosted checkout</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;">Order ID</td>
                        <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">${escapeHtml(order.id)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 20px 24px;">
                    <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">Customer</h2>
                    <p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Name:</strong> ${escapeHtml(
                      order.customer.fullName,
                    )}</p>
                    <p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Email:</strong> ${escapeHtml(
                      order.customer.email,
                    )}</p>
                    <p style="margin:0;font-size:14px;color:#4b5563;"><strong>Phone:</strong> ${escapeHtml(
                      order.customer.phone || "-",
                    )}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 20px 24px;">
                    <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">${
                      order.customer.deliveryMethod === "pickup" ? "Pickup Details" : "Shipping Details"
                    }</h2>
                    ${
                      order.customer.deliveryMethod === "pickup"
                        ? `<p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Method:</strong> Pick up in store</p>
                           <p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Address:</strong> ${escapeHtml(
                             pickupAddress,
                           )}</p>
                           <p style="margin:0;font-size:14px;color:#4b5563;"><strong>Hours:</strong> ${escapeHtml(pickupHours)}</p>`
                        : `<p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Method:</strong> Shipping</p>
                           <p style="margin:0;font-size:14px;color:#4b5563;"><strong>Address:</strong> ${escapeHtml(
                             toSingleLineAddress(order),
                           )}</p>`
                    }
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 20px 24px;">
                    <h2 style="margin:0 0 10px 0;font-size:18px;color:#111827;">Order Summary</h2>
                    ${merchantSummaryTable}
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;border-collapse:collapse;">
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Subtotal</td>
                        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
                          formatMinorCad(order.subtotalMinor),
                        )}</td>
                      </tr>
                      ${
                        pricing.discountMinor > 0
                          ? `<tr>
                               <td style="padding:6px 0;font-size:14px;color:#6b7280;">Discount${
                                 pricing.discountCode ? ` (${escapeHtml(pricing.discountCode)})` : ""
                               }</td>
                               <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">-${escapeHtml(
                                 formatMinorCad(pricing.discountMinor),
                               )}</td>
                             </tr>`
                          : ""
                      }
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Shipping</td>
                        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${
                          order.customer.deliveryMethod === "pickup"
                            ? "Pickup in store"
                            : escapeHtml(formatMinorCad(pricing.shippingMinor))
                        }</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Tax</td>
                        <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
                          formatMinorCad(pricing.taxMinor),
                        )}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #ececec;">Total</td>
                        <td align="right" style="padding:10px 0 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #ececec;">${escapeHtml(
                          formatMinorCad(order.totalMinor),
                        )}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>${buildTrackingHtml({ order, includeLabelLink: true })}</td>
                </tr>
                <tr>
                  <td style="padding:16px 24px;border-top:1px solid #ececec;background:#fafafa;">
                    <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;">
                      <a href="${escapeHtml(
                        `${websiteUrl.replace(/\/+$/, "")}/orders-admin`,
                      )}" style="color:#111827;text-decoration:underline;">Open Orders Dashboard</a>
                    </p>
                    <p style="margin:0;font-size:13px;color:#6b7280;">${escapeHtml(brandName)} | ${escapeHtml(storeLocation)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  });

  if (isCustomerOrderEmailEnabled() && isLikelyEmail(customerRecipient)) {
    const supportLine = supportEmail ? `reply to this email or contact ${supportEmail}` : "reply to this email";

    const customerSummaryTable = `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #ececec;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;">
            <th align="left" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Item</th>
            <th align="left" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(
              customerVariantLabel,
            )}</th>
            <th align="center" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Qty</th>
            <th align="right" style="padding:10px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${formatLineItemsTableHtml(order)}
        </tbody>
      </table>
    `;

    messages.push({
      recipientType: "customer",
      to: customerRecipient,
      subject: `Order Confirmation - ${brandName} (Order #${orderNumber})`,
      text: [
        `Hi ${order.customer.fullName},`,
        "",
        "Thank you for your purchase. We've received your order and are preparing it now.",
        "",
        `Order Number: ${orderNumber}`,
        `Order Date: ${orderDate}`,
        "Payment Method: Clover hosted checkout",
        `Shipping Method: ${deliveryMethod}`,
        "",
        "Items:",
        formatLineItemsText(order),
        "",
        `Subtotal: ${formatMinorCad(order.subtotalMinor)}`,
        pricing.discountMinor > 0 ? `Discount${pricing.discountCode ? ` (${pricing.discountCode})` : ""}: -${formatMinorCad(pricing.discountMinor)}` : "",
        `Shipping: ${order.customer.deliveryMethod === "pickup" ? "Pickup in store" : formatMinorCad(pricing.shippingMinor)}`,
        `Tax: ${formatMinorCad(pricing.taxMinor)}`,
        `Total: ${formatMinorCad(order.totalMinor)}`,
        "",
        order.customer.deliveryMethod === "pickup"
          ? `Pickup: ${pickupAddress} (${pickupHours})`
          : `Shipping Address: ${toSingleLineAddress(order)}`,
        order.customer.deliveryMethod === "pickup"
          ? "We'll email you when your order is ready for pickup."
          : order.shipment
          ? "Your shipment details are ready below."
          : "We will email you with tracking details as soon as your shipment is ready.",
        ...buildTrackingText(order),
        "",
        `Questions? Please ${supportLine}.`,
        `${brandName} | ${storeLocation}`,
        `Website: ${websiteUrl}`,
        `Instagram: ${instagramUrl}`,
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#111827;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #ececec;border-radius:10px;overflow:hidden;">
                  <tr>
                    <td style="padding:24px 24px 16px 24px;border-bottom:1px solid #ececec;background:#ffffff;">
                      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="height:34px;display:block;margin-bottom:12px;" />` : ""}
                      <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(
                        brandName,
                      )}</p>
                      <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:1.25;color:#111827;">Thank you for your order</h1>
                      <p style="margin:0;font-size:15px;color:#4b5563;">Hi ${escapeHtml(
                        order.customer.fullName,
                      )}, we've received your order and are preparing it now.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                        <tr>
                          <td style="padding:4px 0;font-size:14px;color:#6b7280;">Order Number</td>
                          <td align="right" style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;">#${escapeHtml(
                            orderNumber,
                          )}</td>
                        </tr>
                        <tr>
                          <td style="padding:4px 0;font-size:14px;color:#6b7280;">Order Date</td>
                          <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">${escapeHtml(orderDate)}</td>
                        </tr>
                        <tr>
                          <td style="padding:4px 0;font-size:14px;color:#6b7280;">Payment Method</td>
                          <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">Clover hosted checkout</td>
                        </tr>
                        <tr>
                          <td style="padding:4px 0;font-size:14px;color:#6b7280;">Shipping Method</td>
                          <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">${escapeHtml(deliveryMethod)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 20px 24px;">
                      <h2 style="margin:0 0 10px 0;font-size:18px;color:#111827;">Order Summary</h2>
                      ${customerSummaryTable}
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;border-collapse:collapse;">
                        <tr>
                          <td style="padding:6px 0;font-size:14px;color:#6b7280;">Subtotal</td>
                          <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
                            formatMinorCad(order.subtotalMinor),
                          )}</td>
                        </tr>
                        ${
                          pricing.discountMinor > 0
                            ? `<tr>
                                 <td style="padding:6px 0;font-size:14px;color:#6b7280;">Discount${
                                   pricing.discountCode ? ` (${escapeHtml(pricing.discountCode)})` : ""
                                 }</td>
                                 <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">-${escapeHtml(
                                   formatMinorCad(pricing.discountMinor),
                                 )}</td>
                               </tr>`
                            : ""
                        }
                        <tr>
                          <td style="padding:6px 0;font-size:14px;color:#6b7280;">Shipping</td>
                          <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${
                            order.customer.deliveryMethod === "pickup"
                              ? "Pickup in store"
                              : escapeHtml(formatMinorCad(pricing.shippingMinor))
                          }</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;font-size:14px;color:#6b7280;">Tax</td>
                          <td align="right" style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(
                            formatMinorCad(pricing.taxMinor),
                          )}</td>
                        </tr>
                        <tr>
                          <td style="padding:10px 0 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #ececec;">Total</td>
                          <td align="right" style="padding:10px 0 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #ececec;">${escapeHtml(
                            formatMinorCad(order.totalMinor),
                          )}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 20px 24px;">
                      <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">${
                        order.customer.deliveryMethod === "pickup" ? "Pickup Information" : "Shipping Information"
                      }</h2>
                      ${
                        order.customer.deliveryMethod === "pickup"
                          ? `<p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Pickup Address:</strong> ${escapeHtml(
                              pickupAddress,
                            )}</p>
                             <p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Store Hours:</strong> ${escapeHtml(
                               pickupHours,
                             )}</p>
                             <p style="margin:0;font-size:14px;color:#4b5563;">We'll email you when your order is ready for pickup.</p>`
                          : `<p style="margin:0 0 6px 0;font-size:14px;color:#4b5563;"><strong>Shipping Address:</strong> ${escapeHtml(
                              toSingleLineAddress(order),
                            )}</p>
                             <p style="margin:0;font-size:14px;color:#4b5563;">${
                               order.shipment
                                 ? "Your shipment details are ready below."
                                 : "We will email you with tracking details as soon as your shipment is ready."
                             }</p>`
                      }
                    </td>
                  </tr>
                  <tr>
                    <td>${buildTrackingHtml({ order, includeLabelLink: true })}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 20px 24px;">
                      <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">Need help?</h2>
                      <p style="margin:0;font-size:14px;color:#4b5563;">
                        Questions about your order?
                        ${
                          supportEmail
                            ? `Reply to this email or contact us at <a href="mailto:${escapeHtml(
                                supportEmail,
                              )}" style="color:#111827;text-decoration:underline;">${escapeHtml(supportEmail)}</a>.`
                            : "Reply to this email and our team will help you."
                        }
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 24px;border-top:1px solid #ececec;background:#fafafa;">
                      <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;">${escapeHtml(brandName)} | ${escapeHtml(
                        storeLocation,
                      )}</p>
                      <p style="margin:0;font-size:13px;color:#6b7280;">
                        <a href="${escapeHtml(websiteUrl)}" style="color:#111827;text-decoration:underline;">Website</a>
                        &nbsp;|&nbsp;
                        <a href="${escapeHtml(instagramUrl)}" style="color:#111827;text-decoration:underline;">Instagram</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
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
        replyTo: replyToRecipient,
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

  logger.info("email.order_notifications_processed", {
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
