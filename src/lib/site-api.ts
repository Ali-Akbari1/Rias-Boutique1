import { requestJson } from "@/lib/api-client";
import type { GoogleReviewsResponse } from "@/features/store/data/store-content";

interface DiscountSignupResponse {
  success?: boolean;
}

interface OrderStatusResponse {
  orderId?: string;
  paymentStatus?: string;
  confirmed?: boolean;
  pending?: boolean;
  error?: string | { message?: string };
  customerEmail?: string | null;
  deliveryCountry?: string | null;
  estimatedDeliveryDate?: string | null;
}

interface ProductInquiryResponse {
  success?: boolean;
  emailProvider?: "resend" | "mock";
  emailStatus?: "sent" | "queued";
}

export const requestDiscountSignup = (payload: {
  email: string;
  source: string;
  website: string;
  fullName?: string;
}) =>
  requestJson<DiscountSignupResponse>({
    path: "/api/discount-signup",
    method: "POST",
    body: payload,
    fallbackErrorMessage: "Unable to send your discount email right now.",
  });

export const requestGoogleReviews = () =>
  requestJson<GoogleReviewsResponse>({
    path: "/api/google-reviews",
    method: "GET",
    fallbackErrorMessage: "Failed to fetch Google reviews.",
  });

export const requestProductInquiry = (payload: {
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
  website: string;
}) =>
  requestJson<ProductInquiryResponse>({
    path: "/api/product-inquiry",
    method: "POST",
    body: payload,
    fallbackErrorMessage: "Unable to send your inquiry right now.",
  });

export const requestOrderStatus = (params: { orderId?: string; checkoutId?: string }) => {
  const query = new URLSearchParams();
  if (params.orderId) {
    query.set("orderId", params.orderId);
  }
  if (params.checkoutId) {
    query.set("checkoutId", params.checkoutId);
  }

  return requestJson<OrderStatusResponse>({
    path: `/api/order-status?${query.toString()}`,
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
    },
    fallbackErrorMessage: "Unable to verify payment confirmation right now.",
  });
};
