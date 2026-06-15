/**
 * Shared display/parsing helpers for orders, receipts and the dashboard.
 * RLS and the order RPCs (supabase/migrations/0005_orders.sql) remain the
 * authority on data access and lifecycle transitions — these helpers are
 * purely cosmetic or for validating URL query params.
 */
import type { OrderStatus, PaymentMethod } from "@/types/database";

export const ORDER_STATUSES: OrderStatus[] = ["pending", "preparing", "ready", "served"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

export const ORDER_STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  pending: "bg-secondary text-secondary-foreground",
  preparing: "bg-warning/15 text-warning",
  ready: "bg-success/15 text-success",
  served: "border border-input text-muted-foreground",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "upi", "wallet", "other"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  wallet: "Wallet",
  other: "Other",
};

export const ORDERS_PAGE_SIZE = 20;

/** "word_of_mouth" -> "Word Of Mouth" */
export function sourceLabel(source: string): string {
  return source
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Parses a search query as a positive order number, or null if not numeric. */
export function parseOrderNumberQuery(q: string): number | null {
  const trimmed = q.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Parses and clamps a 1-based page number from a search param (defaults to 1). */
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Validates a status filter value; returns null for "all"/absent/unknown. */
export function parseStatusFilter(value: string | string[] | undefined): OrderStatus | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && (ORDER_STATUSES as string[]).includes(v) ? (v as OrderStatus) : null;
}

/** Validates a date filter value (YYYY-MM-DD); returns "" for absent/invalid. */
export function parseDateFilter(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}
