import { randomUUID } from "node:crypto";
import type { CatalogProduct } from "./product-catalog.js";
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "./supabase-admin.js";

export type PaymentStatus = "pending" | "paid" | "failed" | "canceled";
export type DeliveryMethod = "shipping" | "pickup";

export interface OrderCustomer {
  deliveryMethod: DeliveryMethod;
  fullName: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderLineItem {
  productId: string;
  name: string;
  imageUrl?: string;
  unitAmountMinor: number;
  quantity: number;
  lineTotalMinor: number;
  selection?: {
    size?: string;
    color?: string;
  };
}

export interface OrderPricing {
  discountCode: string;
  discountMinor: number;
  shippingMinor: number;
  quotedShippingMinor: number;
  taxMinor: number;
  freeShippingApplied: boolean;
}

export interface StoredShippingQuote {
  provider: "easypost" | "flat_rate";
  shipmentId: string;
  rateId: string;
  carrier: string;
  service: string;
  quotedRateMinor: number;
  customerRateMinor: number;
  currency: string;
  deliveryDays: number | null;
  deliveryDate: string;
  freeShippingApplied: boolean;
  selectedAt: string;
  expiresAt: string;
  contextHash: string;
  tokenHash: string;
}

export interface StoredShipment {
  provider: "easypost" | "manual";
  shipmentId?: string;
  rateId?: string;
  carrier?: string;
  service?: string;
  quotedRateMinor?: number;
  customerRateMinor?: number;
  currency?: string;
  trackingCode?: string;
  trackingUrl?: string;
  labelUrl?: string;
  labelPdfUrl?: string;
  trackingQrCodeDataUrl?: string;
  labelQrCodeDataUrl?: string;
  status?: string;
  purchasedAt?: string;
}

export interface StoredOrder {
  id: string;
  paymentStatus: PaymentStatus;
  idempotencyKey: string;
  cloverCheckoutId: string;
  cloverCheckoutUrl: string;
  paymentReference: string;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  pricing: OrderPricing;
  customer: OrderCustomer;
  lineItems: OrderLineItem[];
  shippingQuote: StoredShippingQuote | null;
  shipment: StoredShipment | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string;
  confirmationEmailSentAt: string;
  lastError: string;
}

interface CreatePendingOrderInput {
  idempotencyKey: string;
  customer: OrderCustomer;
  lineItems: OrderLineItem[];
  subtotalMinor: number;
  totalMinor: number;
  pricing: OrderPricing;
  shippingQuote?: StoredShippingQuote | null;
}

interface SupabaseErrorLike {
  message: string;
  code?: string;
}

interface InventoryRecord {
  quantity: number | null;
  updatedAt: string;
}

interface WebhookEventRecord {
  eventId: string;
  eventType: string;
  orderId: string;
  payloadJson: string;
  receivedAt: string;
  processed: boolean;
}

const nowIso = () => new Date().toISOString();
const DEFAULT_CURRENCY = "CAD";

const isMemoryStoreEnabled = () => process.env.ORDER_STORE_ADAPTER?.trim().toLowerCase() === "memory";
export const isOrderStoreConfigured = () => isMemoryStoreEnabled() || hasSupabaseAdminConfig();

const memoryOrders = new Map<string, StoredOrder>();
const memoryInventory = new Map<string, InventoryRecord>();
const memoryWebhookEvents = new Map<string, WebhookEventRecord>();

const cloneOrder = (order: StoredOrder): StoredOrder => ({
  ...order,
  pricing: { ...order.pricing },
  customer: { ...order.customer },
  lineItems: order.lineItems.map((item) => ({
    ...item,
    selection: item.selection ? { ...item.selection } : undefined,
  })),
  shippingQuote: order.shippingQuote ? { ...order.shippingQuote } : null,
  shipment: order.shipment ? { ...order.shipment } : null,
});

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const asObject = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null);

const asJsonField = <T>(value: unknown, fallback: T): T => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  if (value !== null && typeof value === "object") {
    return value as T;
  }

  return fallback;
};

const normalizeCustomer = (value: unknown): OrderCustomer => {
  const customer = asJsonField<Partial<OrderCustomer>>(value, {});
  return {
    deliveryMethod: customer.deliveryMethod === "pickup" ? "pickup" : "shipping",
    fullName: asString(customer.fullName),
    email: asString(customer.email),
    phone: asString(customer.phone),
    address: asString(customer.address),
    city: asString(customer.city),
    state: asString(customer.state),
    postalCode: asString(customer.postalCode),
    country: asString(customer.country),
  };
};

const normalizePricing = (value: unknown): OrderPricing => {
  const pricing = asJsonField<Partial<OrderPricing>>(value, {});
  return {
    discountCode: asString(pricing.discountCode).trim().toUpperCase(),
    discountMinor: asNumber(pricing.discountMinor),
    shippingMinor: asNumber(pricing.shippingMinor),
    quotedShippingMinor: asNumber(pricing.quotedShippingMinor),
    taxMinor: asNumber(pricing.taxMinor),
    freeShippingApplied: Boolean(pricing.freeShippingApplied),
  };
};

const normalizeShippingQuote = (value: unknown): StoredShippingQuote | null => {
  const quote = asObject(asJsonField<Record<string, unknown> | null>(value, null));
  if (!quote) {
    return null;
  }

  const shipmentId = asString(quote.shipmentId);
  const rateId = asString(quote.rateId);
  if (!shipmentId || !rateId) {
    return null;
  }

  return {
    provider: asString(quote.provider) === "flat_rate" ? "flat_rate" : "easypost",
    shipmentId,
    rateId,
    carrier: asString(quote.carrier),
    service: asString(quote.service),
    quotedRateMinor: asNumber(quote.quotedRateMinor),
    customerRateMinor: asNumber(quote.customerRateMinor),
    currency: asString(quote.currency) || DEFAULT_CURRENCY,
    deliveryDays: typeof quote.deliveryDays === "number" && Number.isFinite(quote.deliveryDays) ? quote.deliveryDays : null,
    deliveryDate: asString(quote.deliveryDate),
    freeShippingApplied: Boolean(quote.freeShippingApplied),
    selectedAt: asString(quote.selectedAt),
    expiresAt: asString(quote.expiresAt),
    contextHash: asString(quote.contextHash),
    tokenHash: asString(quote.tokenHash),
  };
};

const normalizeShipment = (value: unknown): StoredShipment | null => {
  const shipment = asObject(asJsonField<Record<string, unknown> | null>(value, null));
  if (!shipment) {
    return null;
  }

  const provider = asString(shipment.provider).toLowerCase() === "manual" ? "manual" : "easypost";
  const trackingCode = asString(shipment.trackingCode);
  const trackingUrl = asString(shipment.trackingUrl);

  if (provider === "manual") {
    if (!trackingCode && !trackingUrl) {
      return null;
    }

    return {
      provider,
      carrier: asString(shipment.carrier),
      service: asString(shipment.service),
      trackingCode,
      trackingUrl,
      status: asString(shipment.status) || "manual",
      purchasedAt: asString(shipment.purchasedAt),
    };
  }

  const shipmentId = asString(shipment.shipmentId);
  const rateId = asString(shipment.rateId);
  if (!shipmentId || !rateId) {
    return null;
  }

  return {
    provider: "easypost",
    shipmentId,
    rateId,
    carrier: asString(shipment.carrier),
    service: asString(shipment.service),
    quotedRateMinor: asNumber(shipment.quotedRateMinor),
    customerRateMinor: asNumber(shipment.customerRateMinor),
    currency: asString(shipment.currency) || DEFAULT_CURRENCY,
    trackingCode,
    trackingUrl,
    labelUrl: asString(shipment.labelUrl),
    labelPdfUrl: asString(shipment.labelPdfUrl),
    trackingQrCodeDataUrl: asString(shipment.trackingQrCodeDataUrl),
    labelQrCodeDataUrl: asString(shipment.labelQrCodeDataUrl),
    status: asString(shipment.status),
    purchasedAt: asString(shipment.purchasedAt),
  };
};

const parseOrderRow = (row: Record<string, unknown>): StoredOrder => ({
  id: asString(row.id),
  paymentStatus: (asString(row.payment_status) as PaymentStatus) || "pending",
  idempotencyKey: asString(row.idempotency_key),
  cloverCheckoutId: asString(row.clover_checkout_id),
  cloverCheckoutUrl: asString(row.clover_checkout_url),
  paymentReference: asString(row.payment_reference),
  currency: asString(row.currency) || DEFAULT_CURRENCY,
  subtotalMinor: asNumber(row.subtotal_minor),
  totalMinor: asNumber(row.total_minor),
  pricing: normalizePricing(row.pricing_json),
  customer: normalizeCustomer(row.customer_json),
  lineItems: asJsonField<OrderLineItem[]>(row.line_items_json, []),
  shippingQuote: normalizeShippingQuote(row.shipping_quote_json),
  shipment: normalizeShipment(row.shipment_json),
  createdAt: asString(row.created_at),
  updatedAt: asString(row.updated_at),
  paidAt: asString(row.paid_at),
  confirmationEmailSentAt: asString(row.confirmation_email_sent_at),
  lastError: asString(row.last_error),
});

const ensureNoSupabaseError = (error: SupabaseErrorLike | null, context: string) => {
  if (!error) {
    return;
  }
  throw new Error(`Unable to ${context}: ${error.message}`);
};

const normalizePaymentReference = (value: string) => {
  const normalized = value.trim();
  return normalized || "";
};

const findMemoryOrderBy = (predicate: (order: StoredOrder) => boolean) => {
  for (const order of memoryOrders.values()) {
    if (predicate(order)) {
      return cloneOrder(order);
    }
  }
  return null;
};

export const seedInventoryFromCatalog = async (catalog: CatalogProduct[]) => {
  void catalog;
};

export const findOrderById = async (orderId: string) => {
  if (isMemoryStoreEnabled()) {
    const order = memoryOrders.get(orderId);
    return order ? cloneOrder(order) : null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error && error.code !== "PGRST116") {
    ensureNoSupabaseError(error, "load order by ID");
  }
  return data ? parseOrderRow(data as Record<string, unknown>) : null;
};

export const findOrderByCheckoutId = async (checkoutId: string) => {
  if (!checkoutId) {
    return null;
  }

  if (isMemoryStoreEnabled()) {
    return findMemoryOrderBy((order) => order.cloverCheckoutId === checkoutId);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("clover_checkout_id", checkoutId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    ensureNoSupabaseError(error, "load order by checkout ID");
  }
  return data ? parseOrderRow(data as Record<string, unknown>) : null;
};

export const findOrderByIdempotencyKey = async (idempotencyKey: string) => {
  if (!idempotencyKey) {
    return null;
  }

  if (isMemoryStoreEnabled()) {
    return findMemoryOrderBy((order) => order.idempotencyKey === idempotencyKey);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    ensureNoSupabaseError(error, "load order by idempotency key");
  }
  return data ? parseOrderRow(data as Record<string, unknown>) : null;
};

export const createPendingOrder = async (input: CreatePendingOrderInput) => {
  const createdAt = nowIso();

  if (isMemoryStoreEnabled()) {
    const order: StoredOrder = {
      id: randomUUID(),
      paymentStatus: "pending",
      idempotencyKey: input.idempotencyKey,
      cloverCheckoutId: "",
      cloverCheckoutUrl: "",
      paymentReference: "",
      currency: DEFAULT_CURRENCY,
      subtotalMinor: input.subtotalMinor,
      totalMinor: input.totalMinor,
      pricing: { ...input.pricing },
      customer: { ...input.customer },
      lineItems: input.lineItems.map((lineItem) => ({ ...lineItem })),
      shippingQuote: input.shippingQuote ? { ...input.shippingQuote } : null,
      shipment: null,
      createdAt,
      updatedAt: createdAt,
      paidAt: "",
      confirmationEmailSentAt: "",
      lastError: "",
    };
    memoryOrders.set(order.id, cloneOrder(order));
    return cloneOrder(order);
  }

  const orderId = randomUUID();
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("orders").insert({
    id: orderId,
    payment_provider: "clover",
    payment_status: "pending",
    idempotency_key: input.idempotencyKey,
    currency: DEFAULT_CURRENCY,
    subtotal_minor: input.subtotalMinor,
    total_minor: input.totalMinor,
    pricing_json: input.pricing,
    customer_json: input.customer,
    line_items_json: input.lineItems,
    shipping_quote_json: input.shippingQuote || null,
    shipment_json: null,
    created_at: createdAt,
    updated_at: createdAt,
  });

  if (error?.code === "23505") {
    const existing = await findOrderByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }
  ensureNoSupabaseError(error, "create pending order");

  const insertedOrder = await findOrderById(orderId);
  if (!insertedOrder) {
    throw new Error("Failed to load pending order after creation.");
  }
  return insertedOrder;
};

export const attachCheckoutSession = async ({
  orderId,
  checkoutUrl,
  checkoutId,
}: {
  orderId: string;
  checkoutUrl: string;
  checkoutId: string;
}) => {
  if (isMemoryStoreEnabled()) {
    const existing = memoryOrders.get(orderId);
    if (!existing) {
      return;
    }

    existing.cloverCheckoutUrl = checkoutUrl;
    existing.cloverCheckoutId = checkoutId;
    existing.updatedAt = nowIso();
    memoryOrders.set(orderId, cloneOrder(existing));
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      clover_checkout_url: checkoutUrl,
      clover_checkout_id: checkoutId || null,
      updated_at: nowIso(),
    })
    .eq("id", orderId);
  ensureNoSupabaseError(error, "attach checkout session to order");
};

export const markOrderFailed = async ({ orderId, errorMessage }: { orderId: string; errorMessage: string }) => {
  if (isMemoryStoreEnabled()) {
    const existing = memoryOrders.get(orderId);
    if (!existing || existing.paymentStatus === "paid") {
      return;
    }

    existing.paymentStatus = "failed";
    existing.lastError = errorMessage;
    existing.updatedAt = nowIso();
    memoryOrders.set(orderId, cloneOrder(existing));
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: "failed",
      last_error: errorMessage,
      updated_at: nowIso(),
    })
    .eq("id", orderId)
    .neq("payment_status", "paid");
  ensureNoSupabaseError(error, "mark order as failed");
};

export const upsertWebhookEvent = async ({
  eventId,
  eventType,
  orderId,
  payloadJson,
}: {
  eventId: string;
  eventType: string;
  orderId: string;
  payloadJson: string;
}) => {
  if (isMemoryStoreEnabled()) {
    if (memoryWebhookEvents.has(eventId)) {
      return false;
    }

    memoryWebhookEvents.set(eventId, {
      eventId,
      eventType,
      orderId,
      payloadJson,
      receivedAt: nowIso(),
      processed: false,
    });
    return true;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    order_id: orderId || null,
    received_at: nowIso(),
    payload_json: asJsonField(payloadJson, {}),
    processed: false,
  });

  if (error?.code === "23505") {
    return false;
  }

  ensureNoSupabaseError(error, "record webhook event");
  return true;
};

export const markWebhookProcessed = async (eventId: string) => {
  if (isMemoryStoreEnabled()) {
    const existing = memoryWebhookEvents.get(eventId);
    if (!existing) {
      return;
    }
    existing.processed = true;
    memoryWebhookEvents.set(eventId, { ...existing });
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("webhook_events").update({ processed: true }).eq("event_id", eventId);
  ensureNoSupabaseError(error, "mark webhook as processed");
};

export const markOrderPaidAndDecrementInventory = async ({
  orderId,
  paymentReference,
}: {
  orderId: string;
  paymentReference: string;
}) => {
  if (isMemoryStoreEnabled()) {
    const order = memoryOrders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.paymentStatus === "paid") {
      return cloneOrder(order);
    }

    const paidAt = nowIso();
    order.paymentStatus = "paid";
    order.paymentReference = normalizePaymentReference(paymentReference);
    order.paidAt = paidAt;
    order.updatedAt = paidAt;
    order.lastError = "";
    memoryOrders.set(orderId, cloneOrder(order));
    return cloneOrder(order);
  }

  const supabase = getSupabaseAdminClient();
  const existingOrder = await findOrderById(orderId);
  if (!existingOrder) {
    throw new Error(`Order ${orderId} not found.`);
  }
  if (existingOrder.paymentStatus === "paid") {
    return existingOrder;
  }

  const paidAt = nowIso();
  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: "paid",
      payment_reference: normalizePaymentReference(paymentReference) || null,
      paid_at: paidAt,
      updated_at: paidAt,
      last_error: "",
    })
    .eq("id", orderId);
  ensureNoSupabaseError(error, "mark order as paid");

  const updatedOrder = await findOrderById(orderId);
  if (!updatedOrder) {
    throw new Error(`Order ${orderId} could not be loaded after payment update.`);
  }
  return updatedOrder;
};

export const markConfirmationEmailSent = async (orderId: string) => {
  const sentAt = nowIso();

  if (isMemoryStoreEnabled()) {
    const order = memoryOrders.get(orderId);
    if (!order) {
      return;
    }

    order.confirmationEmailSentAt = sentAt;
    order.updatedAt = sentAt;
    memoryOrders.set(orderId, cloneOrder(order));
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      confirmation_email_sent_at: sentAt,
      updated_at: sentAt,
    })
    .eq("id", orderId);
  ensureNoSupabaseError(error, "mark confirmation email as sent");
};

export const saveOrderShipment = async ({
  orderId,
  shipment,
}: {
  orderId: string;
  shipment: StoredShipment;
}) => {
  const updatedAt = nowIso();

  if (isMemoryStoreEnabled()) {
    const order = memoryOrders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    order.shipment = { ...shipment };
    order.updatedAt = updatedAt;
    memoryOrders.set(orderId, cloneOrder(order));
    return cloneOrder(order);
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      shipment_json: shipment,
      updated_at: updatedAt,
    })
    .eq("id", orderId);
  ensureNoSupabaseError(error, "save shipment details");

  const updatedOrder = await findOrderById(orderId);
  if (!updatedOrder) {
    throw new Error(`Order ${orderId} could not be loaded after shipment save.`);
  }
  return updatedOrder;
};

export const listOrders = async () => {
  if (isMemoryStoreEnabled()) {
    return [...memoryOrders.values()]
      .map(cloneOrder)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  ensureNoSupabaseError(error, "list orders");
  return (data || []).map((row) => parseOrderRow(row as Record<string, unknown>));
};

export const getInventoryQuantity = async (productId: string) => {
  if (isMemoryStoreEnabled()) {
    const record = memoryInventory.get(productId);
    return record ? record.quantity : null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("inventory")
    .select("quantity")
    .eq("product_id", productId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    ensureNoSupabaseError(error, "read inventory quantity");
  }

  if (!data || typeof data !== "object") {
    return null;
  }
  const row = data as Record<string, unknown>;
  const quantity = row.quantity;
  return typeof quantity === "number" ? quantity : null;
};

export const resetOrderStoreForTests = async () => {
  if (!isMemoryStoreEnabled()) {
    throw new Error("resetOrderStoreForTests is only available when ORDER_STORE_ADAPTER=memory.");
  }

  memoryOrders.clear();
  memoryInventory.clear();
  memoryWebhookEvents.clear();
};

export const closeOrderStoreForTests = async () => {
  if (!isMemoryStoreEnabled()) {
    return;
  }

  memoryOrders.clear();
  memoryInventory.clear();
  memoryWebhookEvents.clear();
};
