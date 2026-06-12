-- ============================================================================
-- Phase 4 — orders + kitchen tickets (KOT)
--
-- Design:
--   • The order IS the kitchen ticket: status 'pending' = a fresh KOT.
--     Lifecycle: pending → preparing → ready → served (forward-only).
--   • Clients have NO insert/update policies on orders/order_items.
--     - place_order(): security-definer RPC, reprices every line from the
--       live menu (client prices are never trusted), snapshots item data,
--       assigns a per-tenant sequential order number.
--     - update_order_status(): security-definer RPC, validates the
--       transition and membership.
--   • Audit: the generic log_menu_change() trigger (0002) is attached to
--     orders, so placements and status changes land in audit_log.
-- ============================================================================

create type public.order_status as enum ('pending', 'preparing', 'ready', 'served');

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  outlet_id          uuid references public.outlets(id) on delete set null,
  order_number       bigint not null,
  status             public.order_status not null default 'pending',
  customer_name      text check (customer_name is null or length(customer_name) <= 80),
  customer_phone     text check (customer_phone is null or length(customer_phone) <= 20),
  source             text not null default 'walk_in'
                       check (source in ('walk_in','zomato','swiggy','instagram','google','word_of_mouth','repeat','other')),
  notes              text check (notes is null or length(notes) <= 500),
  subtotal           numeric(12,2) not null check (subtotal >= 0),
  tax_total          numeric(12,2) not null check (tax_total >= 0),
  total              numeric(12,2) not null check (total >= 0),
  placed_by          uuid references auth.users(id) on delete set null,
  status_updated_at  timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, order_number)
);

create index orders_tenant_time_idx on public.orders (tenant_id, created_at desc);
-- the kitchen screen's working set: open tickets only
create index orders_kitchen_idx on public.orders (tenant_id, status, created_at)
  where status in ('pending', 'preparing', 'ready');

create trigger orders_touch
  before update on public.orders
  for each row execute function public.set_updated_at();

create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function public.log_menu_change();

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  order_id       uuid not null references public.orders(id) on delete cascade,
  item_id        uuid references public.menu_items(id) on delete set null,
  -- snapshot of the menu item at order time; menu edits never rewrite history
  name           text not null,
  sku            text,
  is_veg         boolean not null default false,
  price          numeric(10,2) not null check (price >= 0),
  tax_rate       numeric(5,2) not null check (tax_rate >= 0 and tax_rate <= 100),
  qty            integer not null check (qty between 1 and 99),
  line_subtotal  numeric(12,2) not null check (line_subtotal >= 0),
  line_tax       numeric(12,2) not null check (line_tax >= 0),
  created_at     timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_tenant_idx on public.order_items (tenant_id);

-- ---------------------------------------------------------------------------
-- RLS: members read; nobody writes directly — RPCs are the only doors.
-- ---------------------------------------------------------------------------
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

create policy orders_select on public.orders
  for select to authenticated using (public.is_member(tenant_id));
create policy order_items_select on public.order_items
  for select to authenticated using (public.is_member(tenant_id));

-- defense in depth beneath the absent write policies
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_order: server-side repricing + snapshot + sequential numbering
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_tenant uuid,
  p_items jsonb,                       -- [{"item_id": uuid, "qty": int}, …]
  p_customer_name text default null,
  p_customer_phone text default null,
  p_source text default 'walk_in',
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order    uuid;
  v_number   bigint;
  v_outlet   uuid;
  v_subtotal numeric(12,2) := 0;
  v_tax      numeric(12,2) := 0;
  v_count    integer;
  v_line     record;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.has_role(p_tenant, array['owner','admin','manager','cashier']::public.member_role[]) then
    raise exception 'not authorized to place orders';
  end if;
  if not public.tenant_is_active(p_tenant) then
    raise exception 'subscription inactive — orders are paused';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid order payload';
  end if;
  select count(*) into v_count from jsonb_array_elements(p_items);
  if v_count < 1 or v_count > 100 then
    raise exception 'an order must contain between 1 and 100 lines';
  end if;

  -- one order number sequence per tenant, race-safe within the transaction
  perform pg_advisory_xact_lock(hashtext('order_number:' || p_tenant::text));
  select coalesce(max(order_number), 0) + 1 into v_number
  from public.orders where tenant_id = p_tenant;

  select id into v_outlet
  from public.outlets where tenant_id = p_tenant and is_active
  order by created_at limit 1;

  insert into public.orders
    (tenant_id, outlet_id, order_number, customer_name, customer_phone, source, notes,
     subtotal, tax_total, total, placed_by)
  values
    (p_tenant, v_outlet, v_number,
     nullif(trim(coalesce(p_customer_name, '')), ''),
     nullif(trim(coalesce(p_customer_phone, '')), ''),
     coalesce(p_source, 'walk_in'), nullif(trim(coalesce(p_notes, '')), ''),
     0, 0, 0, auth.uid())
  returning id into v_order;

  -- REPRICING: every line priced from the live menu; client prices ignored.
  -- Duplicate item_ids are merged; qty clamped 1..99 by the table check.
  for v_line in
    select
      mi.id, mi.name, mi.sku, mi.is_veg, mi.price, mi.tax_rate,
      req.qty,
      round(mi.price * req.qty, 2)                              as line_subtotal,
      round(round(mi.price * req.qty, 2) * mi.tax_rate / 100, 2) as line_tax
    from (
      select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'qty')::int)::int as qty
      from jsonb_array_elements(p_items) e
      group by 1
    ) req
    join public.menu_items mi
      on mi.id = req.item_id and mi.tenant_id = p_tenant and mi.is_available
  loop
    insert into public.order_items
      (tenant_id, order_id, item_id, name, sku, is_veg, price, tax_rate, qty, line_subtotal, line_tax)
    values
      (p_tenant, v_order, v_line.id, v_line.name, v_line.sku, v_line.is_veg,
       v_line.price, v_line.tax_rate, v_line.qty, v_line.line_subtotal, v_line.line_tax);

    v_subtotal := v_subtotal + v_line.line_subtotal;
    v_tax      := v_tax + v_line.line_tax;
  end loop;

  -- any requested item that is missing, foreign, or unavailable voids the order
  get diagnostics v_count = row_count;
  if (select count(distinct e ->> 'item_id') from jsonb_array_elements(p_items) e)
     <> (select count(*) from public.order_items where order_id = v_order) then
    raise exception 'order contains items that are unavailable or no longer on the menu';
  end if;

  update public.orders
  set subtotal = v_subtotal, tax_total = v_tax, total = round(v_subtotal + v_tax, 2)
  where id = v_order;

  return v_order;
end $$;

-- ---------------------------------------------------------------------------
-- update_order_status: forward-only lifecycle, any active staff role
-- (kitchen advances tickets; cashiers/managers mark served)
-- ---------------------------------------------------------------------------
create or replace function public.order_status_rank(s public.order_status)
returns integer language sql immutable
as $$
  select case s
    when 'pending' then 1
    when 'preparing' then 2
    when 'ready' then 3
    when 'served' then 4
  end;
$$;

create or replace function public.update_order_status(
  p_tenant uuid,
  p_order uuid,
  p_status public.order_status
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_current public.order_status;
begin
  if not public.is_member(p_tenant) then
    raise exception 'not authorized';
  end if;
  if not public.tenant_is_active(p_tenant) then
    raise exception 'subscription inactive';
  end if;

  select status into v_current
  from public.orders
  where id = p_order and tenant_id = p_tenant
  for update;
  if not found then
    raise exception 'order not found';
  end if;

  if public.order_status_rank(p_status) <= public.order_status_rank(v_current) then
    raise exception 'invalid status change: % → %', v_current, p_status;
  end if;

  update public.orders
  set status = p_status, status_updated_at = now()
  where id = p_order;
end $$;

revoke all on function
  public.place_order(uuid, jsonb, text, text, text, text),
  public.update_order_status(uuid, uuid, public.order_status),
  public.order_status_rank(public.order_status)
from public, anon;
grant execute on function
  public.place_order(uuid, jsonb, text, text, text, text),
  public.update_order_status(uuid, uuid, public.order_status),
  public.order_status_rank(public.order_status)
to authenticated;
