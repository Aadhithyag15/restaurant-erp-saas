-- ============================================================================
-- Phase 4 — Inventory management
--
-- Design:
--   • ingredients: stock-keeping units (kg/litre/pieces/...) with a minimum
--     threshold for low-stock alerts. current_stock is NEVER writable by
--     clients (forced to 0 on insert via trigger, update revoked) — every
--     change flows through inventory_transactions for a complete audit trail.
--   • inventory_transactions: append-only ledger (purchases, waste, manual
--     adjustments, corrections, and POS-driven sales). RPC-only writes.
--   • menu_item_ingredients: the recipe / BOM — how much of each ingredient
--     a menu item consumes per unit sold.
--   • place_order() (0005) is extended to deplete stock per the recipe when
--     an order is placed, atomically with order creation. If depletion would
--     take an ingredient negative and the tenant has not opted into negative
--     stock (tenants.settings->'inventory'->>'allow_negative_stock'), the
--     whole order is rejected.
-- ============================================================================

create type public.inventory_transaction_type as enum ('purchase', 'waste', 'adjustment', 'correction', 'sale');

-- ---------------------------------------------------------------------------
-- ingredients
-- ---------------------------------------------------------------------------
create table public.ingredients (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  name           text not null check (length(trim(name)) between 2 and 80),
  unit           text not null check (unit in ('kg','g','litre','ml','pieces','dozen','packet','box','bottle','tin')),
  current_stock  numeric(12,3) not null default 0,
  minimum_stock  numeric(12,3) not null default 0 check (minimum_stock >= 0),
  cost_per_unit  numeric(12,2) not null default 0 check (cost_per_unit >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index ingredients_tenant_idx on public.ingredients (tenant_id, name);
create unique index ingredients_name_uidx on public.ingredients (tenant_id, lower(trim(name)));

create trigger ingredients_touch
  before update on public.ingredients
  for each row execute function public.set_updated_at();

create trigger ingredients_audit
  after insert or update or delete on public.ingredients
  for each row execute function public.log_menu_change();

-- current_stock is only ever set via inventory_transactions (below); a freshly
-- created ingredient always starts at zero so the very first stock figure is
-- itself an audited transaction (an 'adjustment' or 'purchase').
create or replace function public.ingredients_force_zero_stock()
returns trigger language plpgsql as $$
begin
  new.current_stock := 0;
  return new;
end $$;

create trigger ingredients_insert_zero_stock
  before insert on public.ingredients
  for each row execute function public.ingredients_force_zero_stock();

alter table public.ingredients enable row level security;

create policy ingredients_select on public.ingredients
  for select to authenticated using (public.is_member(tenant_id));
create policy ingredients_insert on public.ingredients
  for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy ingredients_update on public.ingredients
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
         and public.tenant_is_active(tenant_id))
  with check (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy ingredients_delete on public.ingredients
  for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
         and public.tenant_is_active(tenant_id));

-- Defensive grants (see 0007/0008: new tables don't always inherit the
-- project's standing default privilege). current_stock stays out of reach of
-- direct client UPDATEs — only the security-definer RPCs below (and
-- place_order's depletion) can move it.
grant select, insert, delete on public.ingredients to authenticated;
grant update (name, unit, minimum_stock, cost_per_unit) on public.ingredients to authenticated;

-- ---------------------------------------------------------------------------
-- inventory_transactions — append-only ledger
-- ---------------------------------------------------------------------------
create table public.inventory_transactions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  ingredient_id    uuid not null references public.ingredients(id) on delete cascade,
  type             public.inventory_transaction_type not null,
  quantity_change  numeric(12,3) not null check (quantity_change <> 0),
  resulting_stock  numeric(12,3) not null,
  unit_cost        numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  notes            text check (notes is null or length(notes) <= 500),
  order_id         uuid references public.orders(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index inventory_transactions_tenant_time_idx on public.inventory_transactions (tenant_id, created_at desc);
create index inventory_transactions_ingredient_idx on public.inventory_transactions (ingredient_id, created_at desc);

alter table public.inventory_transactions enable row level security;

create policy inventory_transactions_select on public.inventory_transactions
  for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[]));

-- Append-only in depth, mirroring audit_log: no UPDATE/DELETE policies exist,
-- and this trigger blocks them even for definer functions.
create or replace function public.inventory_transactions_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'inventory_transactions is append-only';
end $$;

create trigger inventory_transactions_no_change
  before update or delete on public.inventory_transactions
  for each row execute function public.inventory_transactions_immutable();

-- no client INSERT policy — writes only via record_inventory_transaction(),
-- correct_stock(), and place_order()'s depletion step (all security definer).
grant select on public.inventory_transactions to authenticated;
revoke insert, update, delete on public.inventory_transactions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- menu_item_ingredients — recipes / BOM
-- ---------------------------------------------------------------------------
create table public.menu_item_ingredients (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  menu_item_id   uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id) on delete cascade,
  quantity       numeric(12,3) not null check (quantity > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (menu_item_id, ingredient_id)
);

create index menu_item_ingredients_item_idx on public.menu_item_ingredients (menu_item_id);
create index menu_item_ingredients_tenant_idx on public.menu_item_ingredients (tenant_id);

create trigger menu_item_ingredients_touch
  before update on public.menu_item_ingredients
  for each row execute function public.set_updated_at();

-- Cross-tenant integrity, mirroring check_item_category_tenant (0003): a
-- recipe line may only join a menu item and an ingredient from the SAME
-- tenant. RLS already makes foreign rows invisible; this is belt-and-braces.
create or replace function public.check_recipe_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.menu_items where id = new.menu_item_id and tenant_id = new.tenant_id) then
    raise exception 'menu item belongs to a different tenant';
  end if;
  if not exists (select 1 from public.ingredients where id = new.ingredient_id and tenant_id = new.tenant_id) then
    raise exception 'ingredient belongs to a different tenant';
  end if;
  return new;
end $$;

create trigger menu_item_ingredients_tenant_guard
  before insert or update on public.menu_item_ingredients
  for each row execute function public.check_recipe_tenant();

alter table public.menu_item_ingredients enable row level security;

create policy menu_item_ingredients_select on public.menu_item_ingredients
  for select to authenticated using (public.is_member(tenant_id));
create policy menu_item_ingredients_insert on public.menu_item_ingredients
  for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy menu_item_ingredients_update on public.menu_item_ingredients
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
         and public.tenant_is_active(tenant_id))
  with check (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy menu_item_ingredients_delete on public.menu_item_ingredients
  for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
         and public.tenant_is_active(tenant_id));

grant select, insert, update, delete on public.menu_item_ingredients to authenticated;

-- ---------------------------------------------------------------------------
-- record_inventory_transaction: purchases, waste and manual adjustments.
-- Corrections (set-to-value) go through correct_stock() below.
-- ---------------------------------------------------------------------------
create or replace function public.record_inventory_transaction(
  p_tenant uuid,
  p_ingredient uuid,
  p_type public.inventory_transaction_type,
  p_quantity_change numeric,
  p_unit_cost numeric default null,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_current numeric(12,3);
  v_new     numeric(12,3);
  v_allow_negative boolean;
begin
  if not public.has_role(p_tenant, array['owner','admin','manager']::public.member_role[]) then
    raise exception 'not authorized';
  end if;
  if not public.tenant_is_active(p_tenant) then
    raise exception 'subscription inactive';
  end if;

  if p_type not in ('purchase', 'waste', 'adjustment') then
    raise exception 'invalid transaction type for this operation';
  end if;
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'quantity change must be non-zero';
  end if;
  if p_type = 'purchase' and p_quantity_change <= 0 then
    raise exception 'purchases must increase stock';
  end if;
  if p_type = 'waste' and p_quantity_change >= 0 then
    raise exception 'waste must decrease stock';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'unit cost cannot be negative';
  end if;

  select current_stock into v_current
  from public.ingredients
  where id = p_ingredient and tenant_id = p_tenant
  for update;
  if not found then
    raise exception 'ingredient not found';
  end if;

  v_new := v_current + p_quantity_change;

  select coalesce((settings -> 'inventory' ->> 'allow_negative_stock')::boolean, false)
  into v_allow_negative
  from public.tenants where id = p_tenant;

  if not v_allow_negative and v_new < 0 then
    raise exception 'this would leave stock at % — enable negative stock in settings to allow it', v_new;
  end if;

  update public.ingredients set current_stock = v_new where id = p_ingredient;

  -- a purchase's unit cost becomes the ingredient's standard cost for valuation
  if p_type = 'purchase' and p_unit_cost is not null then
    update public.ingredients set cost_per_unit = p_unit_cost where id = p_ingredient;
  end if;

  insert into public.inventory_transactions
    (tenant_id, ingredient_id, type, quantity_change, resulting_stock, unit_cost, notes, created_by)
  values
    (p_tenant, p_ingredient, p_type, p_quantity_change, v_new, p_unit_cost, nullif(trim(coalesce(p_notes, '')), ''), auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- correct_stock: set an ingredient's stock to a known value (e.g. after a
-- physical count). Records the delta as a 'correction' transaction.
-- ---------------------------------------------------------------------------
create or replace function public.correct_stock(
  p_tenant uuid,
  p_ingredient uuid,
  p_new_stock numeric,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_current numeric(12,3);
  v_delta   numeric(12,3);
begin
  if not public.has_role(p_tenant, array['owner','admin','manager']::public.member_role[]) then
    raise exception 'not authorized';
  end if;
  if not public.tenant_is_active(p_tenant) then
    raise exception 'subscription inactive';
  end if;
  if p_new_stock is null or p_new_stock < 0 then
    raise exception 'stock cannot be corrected to a negative value';
  end if;

  select current_stock into v_current
  from public.ingredients
  where id = p_ingredient and tenant_id = p_tenant
  for update;
  if not found then
    raise exception 'ingredient not found';
  end if;

  v_delta := p_new_stock - v_current;
  if v_delta = 0 then
    return;
  end if;

  update public.ingredients set current_stock = p_new_stock where id = p_ingredient;

  insert into public.inventory_transactions
    (tenant_id, ingredient_id, type, quantity_change, resulting_stock, notes, created_by)
  values
    (p_tenant, p_ingredient, 'correction', v_delta, p_new_stock, nullif(trim(coalesce(p_notes, '')), ''), auth.uid());
end $$;

revoke all on function
  public.record_inventory_transaction(uuid, uuid, public.inventory_transaction_type, numeric, numeric, text),
  public.correct_stock(uuid, uuid, numeric, text)
from public, anon;
grant execute on function
  public.record_inventory_transaction(uuid, uuid, public.inventory_transaction_type, numeric, numeric, text),
  public.correct_stock(uuid, uuid, numeric, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- place_order: extended with automatic stock depletion per recipe (BOM).
-- Same contract as 0005 (server-side repricing + snapshot + sequential
-- numbering); the new final step deplets ingredient stock for every line and
-- records a 'sale' transaction. If depletion would take any ingredient
-- negative and the tenant has not opted into negative stock, the whole order
-- (including the inventory movements) is rolled back.
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
  v_allow_negative boolean;
  v_ing      record;
  v_new_stock numeric(12,3);
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
  public.place_order(uuid, jsonb, text, text, text, text)
from public, anon;
grant execute on function
  public.place_order(uuid, jsonb, text, text, text, text)
to authenticated;
