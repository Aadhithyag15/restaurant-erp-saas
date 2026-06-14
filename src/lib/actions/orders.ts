"use server";

import { createClient } from "@/lib/supabase/server";
import type { OrderPayloadLine } from "@/lib/cart";
import type { OrderStatus } from "@/types/database";

export type PlaceOrderResult = { ok: true; orderNumber: number } | { ok: false; error: string };

/**
 * Places an order via the place_order RPC, which reprices every line from
 * the live menu (client totals are display-only) and assigns the per-tenant
 * order number. Returns that number for the cashier's in-place confirmation.
 */
export async function placeOrder(tenantId: string, items: OrderPayloadLine[]): Promise<PlaceOrderResult> {
  if (items.length === 0) return { ok: false, error: "Cart is empty." };

  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("place_order", {
    p_tenant: tenantId,
    p_items: items,
  });
  if (error) return { ok: false, error: error.message };

  const { data: order } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return { ok: true, orderNumber: order?.order_number ?? 0 };
}

export type UpdateOrderStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Advances an order's status via the update_order_status RPC, which
 * validates the forward-only transition (pending → preparing → ready →
 * served) and membership server-side.
 */
export async function updateOrderStatus(tenantId: string, orderId: string, status: OrderStatus): Promise<UpdateOrderStatusResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_order_status", {
    p_tenant: tenantId,
    p_order: orderId,
    p_status: status,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
