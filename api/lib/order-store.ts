import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CatalogProduct } from "./product-catalog";

export type PaymentStatus = "pending" | "paid" | "failed" | "canceled";

export interface OrderCustomer {
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
  unitAmountMinor: number;
  quantity: number;
  lineTotalMinor: number;
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
  customer: OrderCustomer;
  lineItems: OrderLineItem[];
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
}

let database: DatabaseSync | null = null;
let activeDbPath = "";

const nowIso = () => new Date().toISOString();

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "commerce.sqlite");
const resolveDbPath = () => process.env.ORDER_DB_PATH?.trim() || DEFAULT_DB_PATH;

const schemaPath = path.resolve(process.cwd(), "api", "db", "schema.sql");
const schemaSql = readFileSync(schemaPath, "utf8");

const ensureParentDirectory = (filePath: string) => {
  const parent = path.dirname(filePath);
  mkdirSync(parent, { recursive: true });
};

const toStringValue = (value: unknown) => (typeof value === "string" ? value : "");
const toNumberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const parseOrderRow = (row: Record<string, unknown>): StoredOrder => ({
  id: toStringValue(row.id),
  paymentStatus: (toStringValue(row.payment_status) as PaymentStatus) || "pending",
  idempotencyKey: toStringValue(row.idempotency_key),
  cloverCheckoutId: toStringValue(row.clover_checkout_id),
  cloverCheckoutUrl: toStringValue(row.clover_checkout_url),
  paymentReference: toStringValue(row.payment_reference),
  currency: toStringValue(row.currency) || "CAD",
  subtotalMinor: toNumberValue(row.subtotal_minor),
  totalMinor: toNumberValue(row.total_minor),
  customer: JSON.parse(toStringValue(row.customer_json) || "{}") as OrderCustomer,
  lineItems: JSON.parse(toStringValue(row.line_items_json) || "[]") as OrderLineItem[],
  createdAt: toStringValue(row.created_at),
  updatedAt: toStringValue(row.updated_at),
  paidAt: toStringValue(row.paid_at),
  confirmationEmailSentAt: toStringValue(row.confirmation_email_sent_at),
  lastError: toStringValue(row.last_error),
});

const getDb = () => {
  const dbPath = resolveDbPath();

  if (database && activeDbPath === dbPath) {
    return database;
  }

  if (database && activeDbPath !== dbPath) {
    database.close();
    database = null;
  }

  ensureParentDirectory(dbPath);
  database = new DatabaseSync(dbPath);
  activeDbPath = dbPath;
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(schemaSql);
  return database;
};

const runInTransaction = <T>(work: () => T): T => {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

export const seedInventoryFromCatalog = (catalog: CatalogProduct[]) => {
  const db = getDb();
  const now = nowIso();
  const statement = db.prepare(
    "INSERT OR IGNORE INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, ?)",
  );

  for (const product of catalog) {
    statement.run(product.id, product.inventory, now);
  }
};

export const findOrderById = (orderId: string) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as Record<string, unknown> | undefined;
  return row ? parseOrderRow(row) : null;
};

export const findOrderByCheckoutId = (checkoutId: string) => {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM orders WHERE clover_checkout_id = ?")
    .get(checkoutId) as Record<string, unknown> | undefined;
  return row ? parseOrderRow(row) : null;
};

export const findOrderByIdempotencyKey = (idempotencyKey: string) => {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM orders WHERE idempotency_key = ?")
    .get(idempotencyKey) as Record<string, unknown> | undefined;
  return row ? parseOrderRow(row) : null;
};

export const createPendingOrder = (input: CreatePendingOrderInput) => {
  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO orders (
      id,
      payment_provider,
      payment_status,
      idempotency_key,
      currency,
      subtotal_minor,
      total_minor,
      customer_json,
      line_items_json,
      created_at,
      updated_at
    ) VALUES (?, 'clover', 'pending', ?, 'CAD', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.idempotencyKey,
    input.subtotalMinor,
    input.totalMinor,
    JSON.stringify(input.customer),
    JSON.stringify(input.lineItems),
    createdAt,
    createdAt,
  );

  const order = findOrderById(id);
  if (!order) {
    throw new Error("Failed to create pending order.");
  }
  return order;
};

export const attachCheckoutSession = ({
  orderId,
  checkoutUrl,
  checkoutId,
}: {
  orderId: string;
  checkoutUrl: string;
  checkoutId: string;
}) => {
  const db = getDb();
  db.prepare(
    "UPDATE orders SET clover_checkout_url = ?, clover_checkout_id = ?, updated_at = ? WHERE id = ?",
  ).run(checkoutUrl, checkoutId || null, nowIso(), orderId);
};

export const markOrderFailed = ({ orderId, errorMessage }: { orderId: string; errorMessage: string }) => {
  const db = getDb();
  db.prepare("UPDATE orders SET payment_status = 'failed', last_error = ?, updated_at = ? WHERE id = ? AND payment_status != 'paid'").run(
    errorMessage,
    nowIso(),
    orderId,
  );
};

export const upsertWebhookEvent = ({
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
  const db = getDb();
  const result = db
    .prepare(
      "INSERT OR IGNORE INTO webhook_events (event_id, event_type, order_id, received_at, payload_json, processed) VALUES (?, ?, ?, ?, ?, 0)",
    )
    .run(eventId, eventType, orderId || null, nowIso(), payloadJson);

  return result.changes > 0;
};

export const markWebhookProcessed = (eventId: string) => {
  const db = getDb();
  db.prepare("UPDATE webhook_events SET processed = 1 WHERE event_id = ?").run(eventId);
};

export const markOrderPaidAndDecrementInventory = ({
  orderId,
  paymentReference,
}: {
  orderId: string;
  paymentReference: string;
}) =>
  runInTransaction(() => {
    const db = getDb();
    const order = findOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.paymentStatus === "paid") {
      return order;
    }

    const now = nowIso();
    const upsertInventoryStatement = db.prepare(
      "INSERT OR IGNORE INTO inventory (product_id, quantity, updated_at) VALUES (?, NULL, ?)",
    );
    const getInventoryStatement = db.prepare("SELECT quantity FROM inventory WHERE product_id = ?");
    const decrementInventoryStatement = db.prepare(
      "UPDATE inventory SET quantity = quantity - ?, updated_at = ? WHERE product_id = ?",
    );

    for (const lineItem of order.lineItems) {
      upsertInventoryStatement.run(lineItem.productId, now);
      const inventoryRow = getInventoryStatement.get(lineItem.productId) as { quantity: number | null } | undefined;

      if (inventoryRow && typeof inventoryRow.quantity === "number") {
        if (inventoryRow.quantity < lineItem.quantity) {
          throw new Error(`Insufficient inventory for product ${lineItem.productId}.`);
        }
        decrementInventoryStatement.run(lineItem.quantity, now, lineItem.productId);
      }
    }

    db.prepare(
      "UPDATE orders SET payment_status = 'paid', payment_reference = ?, paid_at = ?, updated_at = ?, last_error = '' WHERE id = ?",
    ).run(paymentReference || null, now, now, orderId);

    const updated = findOrderById(orderId);
    if (!updated) {
      throw new Error(`Order ${orderId} could not be loaded after payment update.`);
    }
    return updated;
  });

export const markConfirmationEmailSent = (orderId: string) => {
  const db = getDb();
  db.prepare("UPDATE orders SET confirmation_email_sent_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), orderId);
};

export const listOrders = () => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map(parseOrderRow);
};

export const getInventoryQuantity = (productId: string) => {
  const db = getDb();
  const row = db.prepare("SELECT quantity FROM inventory WHERE product_id = ?").get(productId) as
    | { quantity: number | null }
    | undefined;
  return row ? row.quantity : null;
};

export const resetOrderStoreForTests = () => {
  const db = getDb();
  db.exec("DELETE FROM webhook_events");
  db.exec("DELETE FROM inventory");
  db.exec("DELETE FROM orders");
};

export const closeOrderStoreForTests = () => {
  if (!database) {
    return;
  }

  database.close();
  database = null;
  activeDbPath = "";
};
