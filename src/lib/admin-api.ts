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
  }>;
  shippingQuote?: {
    provider?: "easypost" | "flat_rate";
    carrier?: string;
    service?: string;
    deliveryDays?: number | null;
    expiresAt?: string;
  } | null;
  shipment?: {
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
