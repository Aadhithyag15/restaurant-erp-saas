/**
 * Shared display/parsing/aggregation helpers for the sales reports page and
 * the daily closing report. RLS (the SELECT policies on orders, order_items,
 * menu_items and menu_categories) remains the authority on data access —
 * these helpers only shape report data and validate URL query params.
 */
import { round2 } from "@/lib/menu";
import { ORDER_STATUS_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/orders";
import { localDayRangeUtc, shiftDateString } from "@/lib/timezone";
import type { OrderStatus, PaymentMethod } from "@/types/database";

export { PAYMENT_METHODS, PAYMENT_METHOD_LABELS };

export const REPORTS_DEFAULT_RANGE_DAYS = 30;
export const REPORTS_MAX_RANGE_DAYS = 366;
export const TOP_ITEMS_LIMIT = 10;

/** Validates a date filter value (YYYY-MM-DD); returns "" for absent/invalid. */
export function parseReportDateParam(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

/** Validates a payment-method filter value; returns null for "all"/absent/unknown. */
export function parsePaymentMethodFilter(value: string | string[] | undefined): PaymentMethod | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && (PAYMENT_METHODS as string[]).includes(v) ? (v as PaymentMethod) : null;
}

/**
 * Resolves the effective `[from, to]` date range (inclusive, YYYY-MM-DD).
 * - Missing `to` defaults to `today`; a `to` in the future is clamped to today.
 * - Missing `from` defaults to REPORTS_DEFAULT_RANGE_DAYS before `to`.
 * - `from` after `to` is clamped to `to`; the span is capped at REPORTS_MAX_RANGE_DAYS.
 */
export function resolveReportRange(fromParam: string, toParam: string, today: string): { from: string; to: string } {
  let to = toParam || today;
  if (to > today) to = today;

  let from = fromParam || shiftDateString(to, -(REPORTS_DEFAULT_RANGE_DAYS - 1));
  if (from > to) from = to;

  const earliestAllowed = shiftDateString(to, -(REPORTS_MAX_RANGE_DAYS - 1));
  if (from < earliestAllowed) from = earliestAllowed;

  return { from, to };
}

export type ReportOrderRow = {
  id: string;
  order_number: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  customer_name: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  created_at: string;
};

export type ReportOrderItemRow = {
  order_id: string;
  item_id: string | null;
  name: string;
  qty: number;
  line_subtotal: number;
  line_tax: number;
};

export function sumTotal(orders: { total: number }[]): number {
  return round2(orders.reduce((sum, o) => sum + o.total, 0));
}

export function averageOrderValue(orders: { total: number }[]): number {
  if (orders.length === 0) return 0;
  return round2(sumTotal(orders) / orders.length);
}

export type DayRevenue = { date: string; label: string; value: number };

/** One bucket per local calendar day in `[from, to]`, summing order totals. */
export function aggregateRevenueByDay(orders: ReportOrderRow[], from: string, to: string, timeZone: string): DayRevenue[] {
  const days: DayRevenue[] = [];
  let cursor = from;
  for (let i = 0; i < REPORTS_MAX_RANGE_DAYS && cursor <= to; i++) {
    const { start, end } = localDayRangeUtc(cursor, timeZone);
    const value = round2(
      orders.filter((o) => o.created_at >= start && o.created_at < end).reduce((sum, o) => sum + o.total, 0),
    );
    const label = new Date(`${cursor}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    days.push({ date: cursor, label, value });
    cursor = shiftDateString(cursor, 1);
  }
  return days;
}

export type TopItem = { name: string; qty: number; revenue: number };

/** Best-selling items by revenue (qty × (subtotal + tax)), highest first. */
export function aggregateTopItems(items: ReportOrderItemRow[], limit = TOP_ITEMS_LIMIT): TopItem[] {
  const map = new Map<string, TopItem>();
  for (const item of items) {
    const revenue = item.line_subtotal + item.line_tax;
    const existing = map.get(item.name);
    if (existing) {
      existing.qty += item.qty;
      existing.revenue = round2(existing.revenue + revenue);
    } else {
      map.set(item.name, { name: item.name, qty: item.qty, revenue: round2(revenue) });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export type CategoryPerformance = { category: string; qty: number; revenue: number };

/** Revenue grouped by menu category. Items with no live category land in "Uncategorized". */
export function aggregateCategoryPerformance(items: ReportOrderItemRow[], categoryByItemId: Map<string, string>): CategoryPerformance[] {
  const map = new Map<string, CategoryPerformance>();
  for (const item of items) {
    const category = (item.item_id && categoryByItemId.get(item.item_id)) || "Uncategorized";
    const revenue = item.line_subtotal + item.line_tax;
    const existing = map.get(category);
    if (existing) {
      existing.qty += item.qty;
      existing.revenue = round2(existing.revenue + revenue);
    } else {
      map.set(category, { category, qty: item.qty, revenue: round2(revenue) });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export type PaymentBreakdown = { method: PaymentMethod; count: number; total: number };

/** Order count and revenue per payment method, omitting methods with no orders. */
export function aggregatePaymentMethods(orders: ReportOrderRow[]): PaymentBreakdown[] {
  const map = new Map<PaymentMethod, PaymentBreakdown>();
  for (const method of PAYMENT_METHODS) map.set(method, { method, count: 0, total: 0 });
  for (const order of orders) {
    const bucket = map.get(order.payment_method);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.total = round2(bucket.total + order.total);
  }
  return PAYMENT_METHODS.map((m) => map.get(m)!).filter((b) => b.count > 0);
}

export type SalesReportRow = {
  orderNumber: number;
  date: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customer: string;
  subtotal: number;
  tax: number;
  total: number;
};

/** Shapes orders into flat rows for the report table and CSV/Excel/PDF exports. */
export function buildSalesReportRows(orders: ReportOrderRow[], timeZone: string): SalesReportRow[] {
  return orders.map((o) => ({
    orderNumber: o.order_number,
    date: new Date(o.created_at).toLocaleString("en-IN", { timeZone, dateStyle: "medium", timeStyle: "short" }),
    status: o.status,
    paymentMethod: o.payment_method,
    customer: o.customer_name ?? "",
    subtotal: o.subtotal,
    tax: o.tax_total,
    total: o.total,
  }));
}

export const SALES_REPORT_CSV_HEADER = ["Order #", "Date", "Status", "Payment method", "Customer", "Subtotal", "Tax", "Total"];

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Renders sales report rows as CSV text (CRLF line endings, RFC 4180-ish quoting). */
export function salesReportToCsv(rows: SalesReportRow[]): string {
  const lines = [SALES_REPORT_CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        String(r.orderNumber),
        csvEscape(r.date),
        ORDER_STATUS_LABELS[r.status],
        PAYMENT_METHOD_LABELS[r.paymentMethod],
        csvEscape(r.customer),
        r.subtotal.toFixed(2),
        r.tax.toFixed(2),
        r.total.toFixed(2),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}
