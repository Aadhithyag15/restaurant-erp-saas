-- ============================================================================
-- Phase 1 (KOT) fix — grant SELECT on orders/order_items to authenticated
--
-- 0005_orders.sql revoked insert/update/delete from authenticated (writes
-- only via place_order/update_order_status) but never granted select, and
-- unlike the menu_* tables these two don't carry the project's standing
-- default privilege. Without this grant, RLS (orders_select/order_items_select)
-- never even gets evaluated — every authenticated select hits
-- "permission denied for table orders" (42501), so the KOT page, the
-- post-place_order order-number lookup, and the realtime line-item fetch all
-- silently return no rows.
-- ============================================================================

grant select on public.orders, public.order_items to authenticated;
