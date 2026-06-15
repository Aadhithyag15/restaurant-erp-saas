-- ============================================================================
-- Phase 6 — Accounting & Reports
--
--   • orders.payment_method — additive column (default 'cash') so sales
--     reports can break revenue down by tender type. Existing rows backfill
--     to 'cash' automatically; place_order() gains an optional parameter
--     (default 'cash') so older callers keep working unchanged.
--   • daily_closings — one row per tenant per calendar date, recording the
--     cash drawer count (opening/closing) and any cash refunds given out.
--     Total sales and net revenue are derived from `orders` at report time
--     (read-only) rather than snapshotted, so the figures always match the
--     ledger. Owner/admin only, mirroring the "Accounting" nav segment.
--   • Reporting itself (sales reports, top items, category performance,
--     payment-method breakdown) reads orders/order_items/menu_items/
--     menu_categories through their existing SELECT policies — no new views
--     or RPCs needed, and no transactional table semantics change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- orders.payment_method
-- ---------------------------------------------------------------------------
alter table public.orders
  add column payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'upi', 'wallet', 'other'));

-- ---------------------------------------------------------------------------
-- place_order: add p_payment_method (default 'cash'). Dropped first because
-- adding a trailing parameter changes the signature — `create or replace`
-- would otherwise create a second overload and make calls with the original
-- 6 named arguments ambiguous.
-- ---------------------------------------------------------------------------
drop function if exists public.place_order(uuid, jsonb, text, text, text, text);

create or replace function public.place_order(
  p_tenant uuid,
  p_items jsonb,                       -- [{"item_id": uuid, "qty": int}, …]
  p_customer_name text default null,
  p_customer_phone text default null,
  p_source text default 'walk_in',
  p_notes text default null,
  p_payment_method text default 'cash'
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
  v_allow_negative boolean;
  v_ing      record;
  v_new_stock numeric(12,3);
  v_payment  text;
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

  v_payment := lower(trim(coalesce(p_payment_method, 'cash')));
  if v_payment not in ('cash', 'card', 'upi', 'wallet', 'other') then
    raise exception 'invalid payment method';
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
     subtotal, tax_total, total, placed_by, payment_method)
  values
    (p_tenant, v_outlet, v_number,
     nullif(trim(coalesce(p_customer_name, '')), ''),
     nullif(trim(coalesce(p_customer_phone, '')), ''),
     coalesce(p_source, 'walk_in'), nullif(trim(coalesce(p_notes, '')), ''),
     0, 0, 0, auth.uid(), v_payment)
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

  -- ------------------------------------------------------------------------
  -- STOCK DEPLETION (Phase 4): consume ingredients per recipe (BOM), one row
  -- per ingredient, locked in a stable order to minimize deadlocks. Items
  -- with no recipe lines simply contribute nothing.
  -- ------------------------------------------------------------------------
  select coalesce((settings -> 'inventory' ->> 'allow_negative_stock')::boolean, false)
  into v_allow_negative
  from public.tenants where id = p_tenant;

  for v_ing in
    select i.id as ingredient_id, i.name, i.unit, sum(mii.quantity * oi.qty) as total_qty
    from public.order_items oi
    join public.menu_item_ingredients mii on mii.menu_item_id = oi.item_id and mii.tenant_id = p_tenant
    join public.ingredients i on i.id = mii.ingredient_id and i.tenant_id = p_tenant
    where oi.order_id = v_order
    group by i.id, i.name, i.unit
    order by i.id
  loop
    select current_stock - v_ing.total_qty into v_new_stock
    from public.ingredients where id = v_ing.ingredient_id
    for update;

    if not v_allow_negative and v_new_stock < 0 then
      raise exception 'insufficient stock for "%": need % %, only % left',
        v_ing.name, v_ing.total_qty, v_ing.unit, v_new_stock + v_ing.total_qty;
    end if;

    update public.ingredients set current_stock = v_new_stock where id = v_ing.ingredient_id;

    insert into public.inventory_transactions
      (tenant_id, ingredient_id, type, quantity_change, resulting_stock, order_id, created_by)
    values
      (p_tenant, v_ing.ingredient_id, 'sale', -v_ing.total_qty, v_new_stock, v_order, auth.uid());
  end loop;

  return v_order;
end $$;

revoke all on function
  public.place_order(uuid, jsonb, text, text, text, text, text)
from public, anon;
grant execute on function
  public.place_order(uuid, jsonb, text, text, text, text, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- daily_closings — cash drawer reconciliation, one row per tenant per date.
-- Total sales / refunds-from-orders / net revenue are computed by the
-- reporting page from `orders`; this table only stores the manually-counted
-- cash figures and an optional cash-refunds total for the day.
-- ---------------------------------------------------------------------------
create table public.daily_closings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  outlet_id     uuid references public.outlets(id) on delete set null,
  closing_date  date not null,
  opening_cash  numeric(12,2) not null default 0 check (opening_cash >= 0),
  closing_cash  numeric(12,2) not null default 0 check (closing_cash >= 0),
  cash_refunds  numeric(12,2) not null default 0 check (cash_refunds >= 0),
  notes         text check (notes is null or length(notes) <= 500),
  closed_by     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, closing_date)
);

create index daily_closings_tenant_date_idx on public.daily_closings (tenant_id, closing_date desc);

create trigger daily_closings_touch
  before update on public.daily_closings
  for each row execute function public.set_updated_at();

create trigger daily_closings_audit
  after insert or update or delete on public.daily_closings
  for each row execute function public.log_menu_change();

alter table public.daily_closings enable row level security;

create policy daily_closings_select on public.daily_closings
  for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.member_role[]));

create policy daily_closings_insert on public.daily_closings
  for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
              and public.tenant_is_active(tenant_id));

create policy daily_closings_update on public.daily_closings
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
         and public.tenant_is_active(tenant_id))
  with check (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
              and public.tenant_is_active(tenant_id));

-- Defensive grants, mirroring 0007/0008/0009: new tables don't always inherit
-- the project's standing default privilege.
grant select, insert, update on public.daily_closings to authenticated;
