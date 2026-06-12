-- ============================================================================
-- Phase 3 / Milestone 3 — menu items (SKUs)
-- Same contract as 0002. Prices/taxes are stored here as the single source of
-- truth: the POS client only ever displays them — order pricing is recomputed
-- server-side when orders arrive (Phase 4).
-- ============================================================================

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  category_id   uuid references public.menu_categories(id) on delete set null,
  name          text not null check (length(trim(name)) between 2 and 80),
  sku           text check (sku is null or sku ~ '^[A-Za-z0-9._-]{1,40}$'),
  price         numeric(10,2) not null check (price >= 0),
  tax_rate      numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  is_available  boolean not null default true,
  description   text check (description is null or length(description) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index menu_items_tenant_idx on public.menu_items (tenant_id, name);
create index menu_items_category_idx on public.menu_items (category_id);
-- SKU is optional, but when set it is unique per tenant (case-insensitive)
create unique index menu_items_sku_uidx on public.menu_items (tenant_id, lower(sku))
  where sku is not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger menu_items_touch
  before update on public.menu_items
  for each row execute function public.set_updated_at();

alter table public.menu_items enable row level security;

create policy menu_items_select on public.menu_items
  for select to authenticated using (public.is_member(tenant_id));
create policy menu_items_insert on public.menu_items
  for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy menu_items_update on public.menu_items
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
         and public.tenant_is_active(tenant_id))
  with check (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy menu_items_delete on public.menu_items
  for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
         and public.tenant_is_active(tenant_id));

-- Every create/price-change/delete lands in the append-only audit_log
-- (trigger function defined in 0002).
create trigger menu_items_audit
  after insert or update or delete on public.menu_items
  for each row execute function public.log_menu_change();

-- Cross-tenant integrity: an item may only reference a category of the SAME
-- tenant. RLS already makes foreign categories invisible, but belt-and-braces.
create or replace function public.check_item_category_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.menu_categories
    where id = new.category_id and tenant_id = new.tenant_id
  ) then
    raise exception 'category belongs to a different tenant';
  end if;
  return new;
end $$;

create trigger menu_items_category_guard
  before insert or update of category_id on public.menu_items
  for each row execute function public.check_item_category_tenant();
