-- ============================================================================
-- Phase 3 addendum — veg/non-veg flag on menu items
-- No RLS changes needed: policies are row-scoped (role + license) and apply
-- to the new column automatically; the audit trigger logs full rows, so
-- veg-flag changes are already captured in the append-only history.
-- ============================================================================

alter table public.menu_items
  add column is_veg boolean not null default false;
