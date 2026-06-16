-- ============================================================================
-- Restaurant Flow SaaS — Phase 1 foundation (rev 2, post security review)
-- Multi-tenancy, auth profiles, roles, licensing (14-day trial), audit log.
-- Run in the Supabase SQL editor (or `supabase db push`).
-- Postgres 15+ / Supabase conventions (auth.uid(), auth.users).
--
-- Rev 2 changes (CTO review):
--   • edit-code hash moved to tenant_secrets (no client policies — RLS-invisible)
--   • owner memberships protected from admin edits
--   • audit_log: client INSERT removed; writes only via definer functions
--   • trial-abuse guard (one trial per creating account, owned-tenant cap)
--   • verify_edit_code lockout (5 fails / 15 min / user / tenant)
--   • reserved slugs; license gate on UPDATE/DELETE (USING), not just WITH CHECK
--   • tenant_is_active checks current_period_end for 'active'
--   • column-level grants + anon default-privilege revoke (defense in depth)
--   • index tuning (dropped redundant, added partials)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;  -- bcrypt for edit codes
-- pg_cron: enable once via Dashboard → Database → Extensions (see end of file)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'manager', 'cashier', 'kitchen');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  currency    text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  timezone    text not null default 'Asia/Kolkata',
  settings    jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,  -- trial-abuse accounting
  created_at  timestamptz not null default now()
);
create index tenants_created_by_idx on public.tenants (created_by);

-- Secrets live apart from tenants: RLS is enabled with NO policies, so clients
-- can never read or write a row (not even hashes). Only the security-definer
-- functions below touch this table.
create table public.tenant_secrets (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  edit_code_hash  text not null,   -- bcrypt; plaintext never stored or logged
  updated_at      timestamptz not null default now()
);

create table public.outlets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null default 'Main',
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index outlets_tenant_idx on public.outlets (tenant_id);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  created_at  timestamptz not null default now()
);

create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'cashier',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)   -- index also serves all (tenant_id, …) lookups
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role        public.member_role not null default 'cashier'
                check (role <> 'owner'),      -- ownership transfers are a manual operation
  token       uuid not null unique default gen_random_uuid(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index invitations_tenant_idx on public.invitations (tenant_id);

create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  price_monthly numeric(10,2) not null default 0,
  limits        jsonb not null default '{}'::jsonb,   -- e.g. {"outlets":1,"staff":5}
  is_active     boolean not null default true
);

create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique references public.tenants(id) on delete cascade,
  plan_id             uuid not null references public.plans(id),
  status              public.subscription_status not null default 'trialing',
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- serves the nightly expiry cron
create index subscriptions_trialing_idx on public.subscriptions (trial_ends_at)
  where status = 'trialing';

create table public.audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   text,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_tenant_time_idx on public.audit_log (tenant_id, created_at desc);
-- serves the verify_edit_code lockout counter
create index audit_log_edit_code_idx on public.audit_log (tenant_id, user_id, created_at)
  where action = 'edit_code.attempt';

-- Append-only in depth: no UPDATE/DELETE policies exist (RLS), and this trigger
-- blocks them even for definer functions. Only a superuser/backend migration can bypass.
create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Profile auto-creation on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helper functions (security definer: read memberships without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_member(t uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = t and user_id = auth.uid() and is_active
  );
$$;

create or replace function public.has_role(t uuid, roles public.member_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = t and user_id = auth.uid() and is_active
      and role = any (roles)
  );
$$;

-- Two users share a tenant (drives profile visibility without per-row subqueries
-- against RLS-filtered tables).
create or replace function public.shares_tenant_with(p uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m1
    join public.memberships m2 on m1.tenant_id = m2.tenant_id
    where m1.user_id = auth.uid() and m1.is_active
      and m2.user_id = p and m2.is_active
  );
$$;

-- License gate. Used in BOTH `using` and `with check` of every write policy on
-- tenant-data tables (Phase 2+ included): expired tenants are read-only at the
-- database level — UPDATE and DELETE included, not just INSERT.
-- 'trialing' honours trial_ends_at directly, so expiry is exact even before the
-- nightly cron flips the status; 'active' honours current_period_end so a lapsed
-- paid period can never stay live forever.
create or replace function public.tenant_is_active(t uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where tenant_id = t
      and (   (status = 'active'
               and (current_period_end is null or current_period_end > now()))
           or (status = 'trialing' and trial_ends_at > now()))
  );
$$;

revoke all on function
  public.is_member(uuid),
  public.has_role(uuid, public.member_role[]),
  public.shares_tenant_with(uuid),
  public.tenant_is_active(uuid)
from public, anon;
grant execute on function
  public.is_member(uuid),
  public.has_role(uuid, public.member_role[]),
  public.shares_tenant_with(uuid),
  public.tenant_is_active(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tenants        enable row level security;
alter table public.tenant_secrets enable row level security;  -- NO policies: invisible to clients
alter table public.outlets        enable row level security;
alter table public.profiles      enable row level security;
alter table public.memberships   enable row level security;
alter table public.invitations   enable row level security;
alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_log     enable row level security;

-- tenants: members read; owner/admin update (column grants below restrict WHICH
-- columns); create/delete only via RPC / service role
create policy tenants_select on public.tenants
  for select to authenticated using (public.is_member(id));
create policy tenants_update on public.tenants
  for update to authenticated
  using (public.has_role(id, array['owner','admin']::public.member_role[]))
  with check (public.has_role(id, array['owner','admin']::public.member_role[]));

-- outlets: license gate on USING too — an expired tenant cannot UPDATE or DELETE
create policy outlets_select on public.outlets
  for select to authenticated using (public.is_member(tenant_id));
create policy outlets_insert on public.outlets
  for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy outlets_update on public.outlets
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
         and public.tenant_is_active(tenant_id))
  with check (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
              and public.tenant_is_active(tenant_id));
create policy outlets_delete on public.outlets
  for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
         and public.tenant_is_active(tenant_id));

-- profiles: own row, plus co-members (staff names on rosters/receipts)
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_tenant_with(id));
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- memberships: read own rows always (bootstrap) + tenant roster for members.
-- Staff managed by owner/admin, with two escalation guards:
--   • rows whose role is 'owner' can only be touched by an owner (admins cannot
--     demote, disable, or delete the owner)
--   • nobody can GRANT 'owner' unless they are an owner
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_member(tenant_id));
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
              and (role <> 'owner'
                   or public.has_role(tenant_id, array['owner']::public.member_role[])));
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
         and (role <> 'owner'
              or public.has_role(tenant_id, array['owner']::public.member_role[])))
  with check (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
              and (role <> 'owner'
                   or public.has_role(tenant_id, array['owner']::public.member_role[])));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.has_role(tenant_id, array['owner']::public.member_role[])
         and user_id <> auth.uid());

-- invitations: owner/admin manage; acceptance happens via RPC (definer)
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.member_role[]));
create policy invitations_write on public.invitations
  for all to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.member_role[]))
  with check (public.has_role(tenant_id, array['owner','admin']::public.member_role[]));

-- plans: public pricing (read-only for everyone, writes only via service role)
create policy plans_select on public.plans
  for select to anon, authenticated using (is_active);

-- subscriptions: members read their own (trial banner); NO client write policy —
-- status changes only via pg_cron, billing webhooks (service role), or migrations.
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (public.is_member(tenant_id));

-- audit_log: SELECT for admin/manager only. There is deliberately NO client
-- INSERT policy — a member must not be able to fabricate history entries.
-- All writes happen inside security-definer functions (below and in Phase 2+).
create policy audit_select on public.audit_log
  for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- Privilege hardening (defense in depth beneath RLS)
-- ---------------------------------------------------------------------------
-- anon: pricing page only
revoke all on all tables in schema public from anon;
grant select on public.plans to anon;
-- future tables created by migrations don't silently re-grant to anon
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- authenticated: no write paths where none should exist (RLS already denies;
-- grants make it deny twice). tenants updates are column-scoped so a client can
-- never alter slug (URL identity) or created_by (trial accounting) directly.
revoke insert, update, delete on public.tenants from authenticated;
grant update (name, currency, timezone, settings) on public.tenants to authenticated;
revoke all on public.tenant_secrets from anon, authenticated;
revoke insert, update, delete on public.plans          from authenticated;
revoke insert, update, delete on public.subscriptions  from authenticated;
revoke insert, update, delete on public.audit_log      from authenticated;

-- ---------------------------------------------------------------------------
-- RPCs (security definer = the only doors into privileged operations)
-- ---------------------------------------------------------------------------

-- Slugs that collide with app routes can never become tenants.
create or replace function public.is_reserved_slug(p_slug text)
returns boolean
language sql immutable
as $$
  select lower(p_slug) = any (array[
    'api','app','auth','admin','account','assets','billing','dashboard','docs',
    'help','invite','inventory','kitchen','kot','login','logout','new',
    'onboarding','pos','pricing','public','reports','settings','signin',
    'signout','signup','static','status','support','www','accounting'
  ]);
$$;

-- Atomic tenant provisioning with a 14-day trial. Returns the new tenant id.
-- Abuse guards: one trial per creating account (a second restaurant requires an
-- account whose existing tenants are all paid-active), hard cap on owned tenants.
create or replace function public.create_tenant_with_trial(p_name text, p_slug text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_plan   uuid;
  v_slug   text := lower(trim(p_slug));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if public.is_reserved_slug(v_slug) then
    raise exception 'this address is reserved — please choose another';
  end if;

  if (select count(*) from public.tenants where created_by = auth.uid()) >= 5 then
    raise exception 'tenant limit reached for this account — contact support';
  end if;

  if exists (
    select 1
    from public.tenants t
    join public.subscriptions s on s.tenant_id = t.id
    where t.created_by = auth.uid()
      and s.status in ('trialing', 'expired', 'canceled', 'past_due')
  ) then
    raise exception 'this account already has a trial or inactive subscription — contact support to add another restaurant';
  end if;

  select id into v_plan from public.plans where code = 'trial' and is_active;
  if v_plan is null then
    raise exception 'trial plan is not configured';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (trim(p_name), v_slug, auth.uid())
  returning id into v_tenant;

  insert into public.outlets (tenant_id, name) values (v_tenant, 'Main');

  insert into public.memberships (tenant_id, user_id, role)
  values (v_tenant, auth.uid(), 'owner');

  insert into public.subscriptions (tenant_id, plan_id, status, trial_ends_at)
  values (v_tenant, v_plan, 'trialing', now() + interval '14 days');

  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id, new_value)
  values (v_tenant, auth.uid(), 'tenant.created', 'tenant', v_tenant::text,
          jsonb_build_object('name', trim(p_name), 'slug', v_slug,
                             'trial_ends_at', now() + interval '14 days'));
  return v_tenant;
exception
  when unique_violation then
    raise exception 'slug already taken';
end $$;

-- Staff joins via invite link.
create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_inv from public.invitations
  where token = p_token and accepted_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'invitation is invalid or expired';
  end if;
  if lower(v_inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'invitation was issued to a different email address';
  end if;

  insert into public.memberships (tenant_id, user_id, role)
  values (v_inv.tenant_id, auth.uid(), v_inv.role)
  on conflict (tenant_id, user_id) do update set role = excluded.role, is_active = true;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id, new_value)
  values (v_inv.tenant_id, auth.uid(), 'staff.joined', 'membership', auth.uid()::text,
          jsonb_build_object('role', v_inv.role));
  return v_inv.tenant_id;
end $$;

-- Owner/admin sets the manager override code (stored as bcrypt in tenant_secrets,
-- which has no client-readable policies — the hash itself is unreachable).
create or replace function public.set_edit_code(p_tenant uuid, p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(p_tenant, array['owner','admin']::public.member_role[]) then
    raise exception 'not authorized';
  end if;
  if length(p_code) < 4 then
    raise exception 'code must be at least 4 characters';
  end if;

  insert into public.tenant_secrets (tenant_id, edit_code_hash, updated_at)
  values (p_tenant, extensions.crypt(p_code, extensions.gen_salt('bf')), now())
  on conflict (tenant_id) do update
    set edit_code_hash = excluded.edit_code_hash, updated_at = now();

  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (p_tenant, auth.uid(), 'edit_code.changed', 'tenant', p_tenant::text);
end $$;

-- Verification with brute-force lockout: 5 failed attempts per user per tenant
-- in 15 minutes blocks further tries (the immutable audit log is the counter —
-- it cannot be reset from the client). Every attempt is audited; the code value
-- is never logged.
create or replace function public.verify_edit_code(p_tenant uuid, p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_hash  text;
  v_fails int;
  v_ok    boolean;
begin
  if not public.is_member(p_tenant) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_fails
  from public.audit_log
  where tenant_id = p_tenant
    and user_id = auth.uid()
    and action = 'edit_code.attempt'
    and created_at > now() - interval '15 minutes'
    and (new_value ->> 'success') = 'false';
  if v_fails >= 5 then
    raise exception 'too many failed attempts — try again in 15 minutes';
  end if;

  select edit_code_hash into v_hash
  from public.tenant_secrets where tenant_id = p_tenant;

  v_ok := v_hash is not null and extensions.crypt(p_code, v_hash) = v_hash;

  insert into public.audit_log (tenant_id, user_id, action, entity, new_value)
  values (p_tenant, auth.uid(), 'edit_code.attempt', 'tenant',
          jsonb_build_object('success', v_ok));
  return v_ok;
end $$;

revoke all on function
  public.is_reserved_slug(text),
  public.create_tenant_with_trial(text, text),
  public.accept_invitation(uuid),
  public.set_edit_code(uuid, text),
  public.verify_edit_code(uuid, text)
from public, anon;
grant execute on function
  public.is_reserved_slug(text),
  public.create_tenant_with_trial(text, text),
  public.accept_invitation(uuid),
  public.set_edit_code(uuid, text),
  public.verify_edit_code(uuid, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Seed plans
-- ---------------------------------------------------------------------------
insert into public.plans (code, name, price_monthly, limits) values
  ('trial',    '14-day Free Trial', 0,    '{"outlets": 1, "staff": 5}'),
  ('standard', 'Standard',          999,  '{"outlets": 1, "staff": 10}'),
  ('pro',      'Pro',               2499, '{"outlets": 5, "staff": 50}')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Trial expiry (pg_cron)
-- Bookkeeping only: tenant_is_active() already cuts access at the exact
-- timestamp; this flip drives UI states and emails. Phase 5 extends the same
-- job with active→past_due on current_period_end.
-- First enable pg_cron: Dashboard → Database → Extensions → pg_cron → Enable.
-- Then run this block once:
-- ---------------------------------------------------------------------------
-- select cron.schedule(
--   'expire-trials',
--   '15 0 * * *',   -- daily 00:15 UTC
--   $cron$
--     update public.subscriptions
--     set status = 'expired', updated_at = now()
--     where status = 'trialing' and trial_ends_at < now();
--   $cron$
-- );
