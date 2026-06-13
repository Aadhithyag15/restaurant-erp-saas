import { round2 } from "@/lib/menu";

/**
 * Pure cart state + math for the POS screen. Client-side only and display-only:
 * when orders ship (Phase 4), the server recomputes every price from the live
 * menu — a tampered client can render a wrong total but never pay it.
 */

export type CartItem = {
  itemId: string;
  name: string;
  price: number;
  taxRate: number;
};

export type CartLine = CartItem & { qty: number };

export const MAX_QTY = 99;

/** All operations return new arrays — React state friendly. */
export function addToCart(lines: CartLine[], item: CartItem): CartLine[] {
  const existing = lines.find((l) => l.itemId === item.itemId);
  if (!existing) return [...lines, { ...item, qty: 1 }];
  return lines.map((l) => (l.itemId === item.itemId ? { ...l, qty: Math.min(l.qty + 1, MAX_QTY) } : l));
}

export function setQuantity(lines: CartLine[], itemId: string, qty: number): CartLine[] {
  if (!Number.isFinite(qty)) return lines;
  const clamped = Math.min(Math.floor(qty), MAX_QTY);
  if (clamped <= 0) return removeFromCart(lines, itemId);
  return lines.map((l) => (l.itemId === itemId ? { ...l, qty: clamped } : l));
}

export function removeFromCart(lines: CartLine[], itemId: string): CartLine[] {
  return lines.filter((l) => l.itemId !== itemId);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

export function lineSubtotal(line: CartLine): number {
  return round2(line.price * line.qty);
}

export function lineTax(line: CartLine): number {
  return round2((lineSubtotal(line) * line.taxRate) / 100);
}

export type CartTotals = { subtotal: number; tax: number; total: number };

export function cartTotals(lines: CartLine[]): CartTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + lineSubtotal(l), 0));
  const tax = round2(lines.reduce((sum, l) => sum + lineTax(l), 0));
  return { subtotal, tax, total: round2(subtotal + tax) };
}

export type OrderPayloadLine = { item_id: string; qty: number };

/** Shapes the cart for the place_order RPC — server reprices every line from this. */
export function toOrderPayload(lines: CartLine[]): OrderPayloadLine[] {
  return lines.map((l) => ({ item_id: l.itemId, qty: l.qty }));
}
