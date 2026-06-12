-- ============================================================================
-- Phase 3 / Milestone 2 — menu categories
-- Follows the 0001 contract: tenant_id + RLS on every table, license gate in
-- BOTH using and with check, audit history written only by trusted code.
-- ============================================================================

create table public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) between 2 and 40),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index menu_categories_tenant_idx on public.menu_categories (tenant_id, sort_order);
-- one "Starters" per restaurant, case-insensitive
create unique index menu_categories_name_uidx on public.menu_categories (tenant_id, lower(trim(name)));

alter table public.menu_categories enable row level security;

create policy menu_categories_select on public.menu_categories
  for select to authenticated using (public.is_member(tenant_id));
create policy menu_categories_insert on public.menu_categories
  for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy menu_categories_update on public.menu_categories
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
         and public.tenant_is_active(tenant_id))
  with check (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy menu_categories_delete on public.menu_categories
  for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[])
         and public.tenant_is_active(tenant_id));

-- ---------------------------------------------------------------------------
-- Audit trail for menu data. audit_log has no client INSERT policy by design;
-- this definer trigger is the trusted writer. Attached to menu_items in 0003.
-- ---------------------------------------------------------------------------
create or replace function public.log_menu_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_action text;
  v_old    jsonb;
  v_new    jsonb;
  v_id     text;
begin
  if tg_op = 'INSERT' then
    v_tenant := new.tenant_id; v_id := new.id::text;
    v_action := tg_table_name || '.created';
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_tenant := new.tenant_id; v_id := new.id::text;
    v_action := tg_table_name || '.updated';
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    if v_old = v_new then
      return new; -- no-op update, nothing worth recording
    end if;
  else
    v_tenant := old.tenant_id; v_id := old.id::text;
    v_action := tg_table_name || '.deleted';
    v_old := to_jsonb(old);
  end if;

  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id, old_value, new_value)
  values (v_tenant, auth.uid(), v_action, tg_table_name, v_id, v_old, v_new);

  return coalesce(new, old);
end $$;

create trigger menu_categories_audit
  after insert or update or delete on public.menu_categories
  for each row execute function public.log_menu_change();
