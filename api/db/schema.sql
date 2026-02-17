PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  payment_provider TEXT NOT NULL DEFAULT 'clover',
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'failed', 'canceled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  clover_checkout_id TEXT UNIQUE,
  clover_checkout_url TEXT,
  payment_reference TEXT,
  currency TEXT NOT NULL DEFAULT 'CAD',
  subtotal_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  customer_json TEXT NOT NULL,
  line_items_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  confirmation_email_sent_at TEXT,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE TABLE IF NOT EXISTS inventory (
  product_id TEXT PRIMARY KEY,
  quantity INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  order_id TEXT,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_order_id ON webhook_events(order_id);
