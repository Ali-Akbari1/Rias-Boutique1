import { requestJson } from "@/lib/api-client";

export type PaymentStatus = "pending" | "paid" | "failed" | "canceled";

export interface AdminOrder {
  id: string;
  paymentStatus: PaymentStatus;
  cloverCheckoutId: string;
  paymentReference: string;
  subtotalMinor: number;
  totalMinor: number;
  pricing?: {
    discountCode?: string;
    discountMinor?: number;
    shippingMinor?: number;
    quotedShippingMinor?: number;
    taxMinor?: number;
    freeShippingApplied?: boolean;
  };
  customer: {
    deliveryMethod?: "shipping" | "pickup";
    fullName: string;
    email: string;
    phone?: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  lineItems: Array<{
    productId: string;
    name: string;
    unitAmountMinor: number;
    quantity: number;
    lineTotalMinor: number;
    selection?: {
      size?: string;
      color?: string;
    };
  }>;
  shippingQuote?: {
    provider?: "easypost" | "flat_rate";
    carrier?: string;
    service?: string;
    deliveryDays?: number | null;
    expiresAt?: string;
  } | null;
  shipment?: {
    provider?: "easypost" | "manual";
    shipmentId?: string;
    carrier?: string;
    service?: string;
    trackingCode?: string;
    trackingUrl?: string;
    labelUrl?: string;
    labelPdfUrl?: string;
    trackingQrCodeDataUrl?: string;
    labelQrCodeDataUrl?: string;
    status?: string;
    purchasedAt?: string;
  } | null;
  createdAt: string;
  paidAt: string;
}

export interface AdminOrdersResponse {
  orders?: AdminOrder[];
  count?: number;
  order?: AdminOrder;
  message?: string;
  error?: {
    message?: string;
  };
}

export interface EmailTestResponse {
  ok?: boolean;
  type?: "confirmation" | "tracking";
  recipient?: string;
  productId?: string;
  orderId?: string;
  error?: {
    message?: string;
  };
}

const buildAdminHeaders = (adminToken: string) => ({
  "x-admin-token": adminToken.trim(),
});

export const requestAdminOrders = (adminToken: string) =>
  requestJson<AdminOrdersResponse>({
    path: "/api/admin-orders",
    method: "GET",
    headers: buildAdminHeaders(adminToken),
    fallbackErrorMessage: "Unable to load orders. Check your admin token and try again.",
  });

export const requestRetryShipmentLabel = (adminToken: string, orderId: string) =>
  requestJson<AdminOrdersResponse>({
    path: "/api/admin-orders",
    method: "POST",
    headers: buildAdminHeaders(adminToken),
    body: {
      action: "retry_label_purchase",
      orderId,
    },
    fallbackErrorMessage: "Unable to purchase a shipping label right now.",
  });

export const requestRefundShipmentLabel = (adminToken: string, orderId: string) =>
  requestJson<AdminOrdersResponse>({
    path: "/api/admin-orders",
    method: "POST",
    headers: buildAdminHeaders(adminToken),
    body: {
      action: "refund_label",
      orderId,
    },
    fallbackErrorMessage: "Unable to request a shipping label refund right now.",
  });

export const requestSendTrackingEmail = (adminToken: string, orderId: string) =>
  requestJson<AdminOrdersResponse>({
    path: "/api/admin-orders",
    method: "POST",
    headers: buildAdminHeaders(adminToken),
    body: {
      action: "send_tracking_email",
      orderId,
    },
    fallbackErrorMessage: "Unable to send the tracking email right now.",
  });

export const requestSendPickupReadyEmail = (adminToken: string, orderId: string) =>
  requestJson<AdminOrdersResponse>({
    path: "/api/admin-orders",
    method: "POST",
    headers: buildAdminHeaders(adminToken),
    body: {
      action: "send_pickup_ready_email",
      orderId,
    },
    fallbackErrorMessage: "Unable to send the pickup-ready email right now.",
  });

export const requestUpdateManualTracking = (
  adminToken: string,
  payload: {
    orderId: string;
    trackingCode?: string;
    trackingUrl?: string;
    carrier?: string;
    service?: string;
  },
) =>
  requestJson<AdminOrdersResponse>({
    path: "/api/admin-orders",
    method: "POST",
    headers: buildAdminHeaders(adminToken),
    body: {
      action: "update_tracking_manual",
      orderId: payload.orderId,
      trackingCode: payload.trackingCode,
      trackingUrl: payload.trackingUrl,
      carrier: payload.carrier,
      service: payload.service,
    },
    fallbackErrorMessage: "Unable to save tracking details right now.",
  });

export const requestEmailTest = (
  adminToken: string,
  payload: { type: "confirmation" | "tracking"; customerEmail?: string; orderId?: string },
) =>
  requestJson<EmailTestResponse>({
    path: "/api/admin-orders",
    method: "POST",
    headers: buildAdminHeaders(adminToken),
    body: {
      action: "send_test_email",
      type: payload.type,
      ...(payload.orderId ? { orderId: payload.orderId } : {}),
      ...(payload.customerEmail ? { customerEmail: payload.customerEmail } : {}),
    },
    fallbackErrorMessage: "Unable to send the test email right now.",
  });
