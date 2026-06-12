import { MAX_QTY, type CartItem, type CartLine } from "@/lib/cart";

/**
 * Versioned localStorage persistence for the POS cart.
 * Restore rules:
 *   - anything malformed (bad JSON, wrong version, junk lines) → empty cart,
 *     never an exception: a corrupt cache must not break the POS
 *   - when a live item map is supplied, lines are re-anchored to the CURRENT
 *     menu — items that vanished or went unavailable are dropped, and stored
 *     prices/taxes/names are replaced by live values (only qty is trusted)
 */

const VERSION = 1;

export function cartStorageKey(tenantSlug: string): string {
  return `pos-cart:${tenantSlug}`;
}

export function serializeCart(lines: CartLine[]): string {
  return JSON.stringify({ v: VERSION, lines });
}

export function deserializeCart(raw: string | null, liveItems?: ReadonlyMap<string, CartItem>): CartLine[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];
  const { v, lines } = parsed as { v?: unknown; lines?: unknown };
  if (v !== VERSION || !Array.isArray(lines)) return [];

  const out: CartLine[] = [];
  const seen = new Set<string>();

  for (const entry of lines) {
    if (typeof entry !== "object" || entry === null) continue;
    const { itemId, name, price, taxRate, qty } = entry as Record<string, unknown>;

    if (typeof itemId !== "string" || itemId === "" || seen.has(itemId)) continue;
    if (typeof qty !== "number" || !Number.isFinite(qty)) continue;
    const safeQty = Math.min(Math.floor(qty), MAX_QTY);
    if (safeQty < 1) continue;

    if (liveItems) {
      const live = liveItems.get(itemId);
      if (!live) continue; // deleted or unavailable since last visit
      seen.add(itemId);
      out.push({ ...live, qty: safeQty });
      continue;
    }

    if (typeof name !== "string" || name === "") continue;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) continue;
    if (typeof taxRate !== "number" || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) continue;

    seen.add(itemId);
    out.push({ itemId, name, price, taxRate, qty: safeQty });
  }

  return out;
}
