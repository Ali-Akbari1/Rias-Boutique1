import { type ApiRequest, type ApiResponse, sendError } from "../server/lib/http.js";
import { getShippingProviderMode } from "../server/lib/checkout-pricing.js";
import { isEasyPostConfigured } from "../server/lib/easypost.js";
import { isOrderStoreConfigured } from "../server/lib/order-store.js";
import { hasSupabaseAdminConfig } from "../server/lib/supabase-admin.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      orderStoreConfigured: isOrderStoreConfigured(),
      supabaseAdminConfigured: hasSupabaseAdminConfig(),
      shippingProviderMode: getShippingProviderMode(),
      easypostConfigured: isEasyPostConfigured(),
      upstashConfigured: Boolean(
        process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
      ),
    },
  });
}
