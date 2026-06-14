-- ============================================================================
-- Phase 1 (KOT) — enable Realtime on orders + order_items
--
-- The kitchen display subscribes to postgres_changes on these tables so new
-- tickets and status transitions appear live. Realtime authorizes
-- subscriptions against the existing RLS policies (orders_select /
-- order_items_select), so no new access is granted beyond what a member can
-- already read.
-- ============================================================================

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
