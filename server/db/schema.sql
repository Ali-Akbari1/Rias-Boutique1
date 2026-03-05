create table if not exists orders (
  id text primary key,
  payment_provider text not null default 'clover',
  payment_status text not null check (payment_status in ('pending', 'paid', 'failed', 'canceled')),
  idempotency_key text not null unique,
  clover_checkout_id text unique,
  clover_checkout_url text,
  payment_reference text,
  currency text not null default 'CAD',
  subtotal_minor integer not null,
  total_minor integer not null,
  customer_json jsonb not null,
  line_items_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  confirmation_email_sent_at timestamptz,
  last_error text
);

create index if not exists idx_orders_payment_status on orders (payment_status);
create index if not exists idx_orders_created_at on orders (created_at);

create table if not exists inventory (
  product_id text primary key,
  quantity integer,
  updated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  event_id text primary key,
  event_type text not null,
  order_id text references orders(id) on delete set null,
  received_at timestamptz not null default now(),
  payload_json jsonb not null,
  processed boolean not null default false
);

create index if not exists idx_webhook_events_order_id on webhook_events (order_id);

create table if not exists email_logs (
  id bigserial primary key,
  order_id text references orders(id) on delete set null,
  to_email text not null,
  subject text not null,
  payload_json jsonb not null,
  provider text not null default 'mock',
  status text not null default 'queued',
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_email_logs_order_id on email_logs (order_id);
create index if not exists idx_email_logs_sent_at on email_logs (sent_at);

create table if not exists discount_subscribers (
  id bigserial primary key,
  email text not null unique,
  full_name text not null default '',
  source text not null default 'launch-popup',
  campaign text not null default 'launch10_2026_03_17',
  code text not null default 'LAUNCH10',
  metadata_json jsonb not null default '{}'::jsonb,
  subscribed_at timestamptz not null default now(),
  last_email_sent_at timestamptz
);

create index if not exists idx_discount_subscribers_subscribed_at on discount_subscribers (subscribed_at);
create index if not exists idx_discount_subscribers_campaign on discount_subscribers (campaign);

create or replace function mark_order_paid_and_decrement_inventory(
  p_order_id text,
  p_payment_reference text
)
returns orders
language plpgsql
as $$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_product_id text;
  v_quantity integer;
  v_inventory_quantity integer;
begin
  select *
  into v_order
  from orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_order.payment_status = 'paid' then
    return v_order;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_order.line_items_json, '[]'::jsonb))
  loop
    v_product_id := trim(coalesce(v_item ->> 'productId', ''));
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_product_id = '' or v_quantity <= 0 then
      continue;
    end if;

    insert into inventory (product_id, quantity, updated_at)
    values (v_product_id, null, now())
    on conflict (product_id) do nothing;

    select quantity
    into v_inventory_quantity
    from inventory
    where product_id = v_product_id
    for update;

    if v_inventory_quantity is not null then
      update inventory
      set quantity = quantity - v_quantity,
          updated_at = now()
      where product_id = v_product_id
        and quantity >= v_quantity;

      if not found then
        raise exception 'Insufficient inventory for product %', v_product_id;
      end if;
    end if;
  end loop;

  update orders
  set payment_status = 'paid',
      payment_reference = nullif(trim(coalesce(p_payment_reference, '')), ''),
      paid_at = now(),
      updated_at = now(),
      last_error = ''
  where id = p_order_id
  returning *
  into v_order;

  return v_order;
end;
$$;
