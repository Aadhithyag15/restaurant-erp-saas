-- ============================================================================
-- Phase 2 — Staff management (invitations + roster)
--
--   • profiles.email — denormalized from auth.users so rosters can show who
--     someone is without exposing the auth schema to clients.
--   • shares_tenant_with(): the OTHER user's membership no longer needs to be
--     active, so an active admin can still see a disabled co-member's name on
--     the roster.
--   • memberships_update: nobody may update their OWN membership row — closes
--     the gap where an owner could disable/demote themselves (mirrors the
--     existing self-protection on memberships_delete).
--   • get_invitation_preview(): security-definer, anon-readable — lets the
--     (possibly signed-out) invite-accept page show who invited whom to where.
--     Possession of the token is the authorization, same as the link itself.
--   • Defensive grants on invitations/memberships/profiles to `authenticated`,
--     mirroring the 0007 fix (some Phase 1 tables didn't carry the project's
--     standing default privilege).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles.email
-- ---------------------------------------------------------------------------
alter table public.profiles add column email text not null default '';

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email = '' and u.email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- Column-scoped grant: users may edit their display name/phone; email mirrors
-- auth.users and must never be spoofable via a direct table write (it's shown
-- on the staff roster).
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- shares_tenant_with(): drop the target's is_active requirement so active
-- staff can still resolve a disabled co-member's name/email on the roster.
-- (The viewer must still be an active member — m1.is_active is unchanged.)
-- ---------------------------------------------------------------------------
create or replace function public.shares_tenant_with(p uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m1
    join public.memberships m2 on m1.tenant_id = m2.tenant_id
    where m1.user_id = auth.uid() and m1.is_active
      and m2.user_id = p
  );
$$;

-- ---------------------------------------------------------------------------
-- memberships_update: add a self-modification guard, matching the existing
-- `user_id <> auth.uid()` rule on memberships_delete. Without this, an owner
-- (or admin) could flip their own is_active to false or change their own role.
-- ---------------------------------------------------------------------------
drop policy memberships_update on public.memberships;
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
         and user_id <> auth.uid()
         and (role <> 'owner'
              or public.has_role(tenant_id, array['owner']::public.member_role[])))
  with check (public.has_role(tenant_id, array['owner','admin']::public.member_role[])
              and user_id <> auth.uid()
              and (role <> 'owner'
                   or public.has_role(tenant_id, array['owner']::public.member_role[])));

-- ---------------------------------------------------------------------------
-- get_invitation_preview(): lets the invite-accept page (which may be visited
-- signed-out) show the tenant name, invited email and role for a token,
-- without granting any access to the rest of `invitations`.
-- ---------------------------------------------------------------------------
create or replace function public.get_invitation_preview(p_token uuid)
returns table (
  tenant_name text,
  tenant_slug text,
  email       text,
  role        public.member_role,
  is_expired  boolean,
  is_accepted boolean
)
language sql stable security definer set search_path = public
as $$
  select t.name, t.slug, i.email, i.role,
         i.expires_at <= now(),
         i.accepted_at is not null
  from public.invitations i
  join public.tenants t on t.id = i.tenant_id
  where i.token = p_token;
$$;

revoke all on function public.get_invitation_preview(uuid) from public, anon, authenticated;
grant execute on function public.get_invitation_preview(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- One pending invite per (tenant, email) — the app refreshes the existing
-- pending row on re-invite; this index also serves that lookup.
-- ---------------------------------------------------------------------------
create unique index invitations_pending_unique on public.invitations (tenant_id, lower(email))
  where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Defensive grants (see 0007: orders/order_items didn't carry the standing
-- default privilege either). RLS policies for these tables already exist and
-- are the real gate; these grants make sure postgrest even evaluates them.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.invitations to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select on public.profiles to authenticated;
