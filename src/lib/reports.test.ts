import { describe, expect, it } from "vitest";
import {
  aggregateCategoryPerformance,
  aggregatePaymentMethods,
  aggregateRevenueByDay,
  aggregateTopItems,
  averageOrderValue,
  buildSalesReportRows,
  parsePaymentMethodFilter,
  parseReportDateParam,
  resolveReportRange,
  salesReportToCsv,
  sumTotal,
  type ReportOrderItemRow,
  type ReportOrderRow,
} from "@/lib/reports";

const TZ = "Asia/Kolkata";

function order(overrides: Partial<ReportOrderRow> = {}): ReportOrderRow {
  return {
    id: "o1",
    order_number: 1,
    status: "served",
    payment_method: "cash",
    customer_name: null,
    subtotal: 100,
    tax_total: 5,
    total: 105,
    created_at: "2026-06-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("parseReportDateParam", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(parseReportDateParam("2026-06-14")).toBe("2026-06-14");
  });

  it("rejects malformed or missing values", () => {
    expect(parseReportDateParam("14-06-2026")).toBe("");
    expect(parseReportDateParam(undefined)).toBe("");
    expect(parseReportDateParam(["2026-06-14", "x"])).toBe("2026-06-14");
  });
});

describe("parsePaymentMethodFilter", () => {
  it("accepts known methods", () => {
    expect(parsePaymentMethodFilter("upi")).toBe("upi");
    expect(parsePaymentMethodFilter("cash")).toBe("cash");
  });

  it("returns null for unknown or missing values", () => {
    expect(parsePaymentMethodFilter("bitcoin")).toBeNull();
    expect(parsePaymentMethodFilter(undefined)).toBeNull();
    expect(parsePaymentMethodFilter("")).toBeNull();
  });
});

describe("resolveReportRange", () => {
  const today = "2026-06-15";

  it("defaults to the trailing 30 days ending today", () => {
    expect(resolveReportRange("", "", today)).toEqual({ from: "2026-05-17", to: "2026-06-15" });
  });

  it("clamps a future `to` to today", () => {
    expect(resolveReportRange("", "2026-12-31", today)).toEqual({ from: "2026-05-17", to: "2026-06-15" });
  });

  it("clamps `from` after `to` down to `to`", () => {
    expect(resolveReportRange("2026-06-20", "2026-06-10", today)).toEqual({ from: "2026-06-10", to: "2026-06-10" });
  });

  it("respects explicit from/to within range", () => {
    expect(resolveReportRange("2026-06-01", "2026-06-05", today)).toEqual({ from: "2026-06-01", to: "2026-06-05" });
  });

  it("caps the span at REPORTS_MAX_RANGE_DAYS", () => {
    const { from, to } = resolveReportRange("2000-01-01", today, today);
    expect(to).toBe(today);
    expect(from).toBe("2025-06-15");
  });
});

describe("sumTotal / averageOrderValue", () => {
  it("sums totals and rounds to 2dp", () => {
    expect(sumTotal([order({ total: 10.005 }), order({ total: 20.005 })])).toBeCloseTo(30.01, 2);
  });

  it("returns 0 for an empty order list", () => {
    expect(averageOrderValue([])).toBe(0);
  });

  it("averages totals", () => {
    expect(averageOrderValue([order({ total: 100 }), order({ total: 200 })])).toBe(150);
  });
});

describe("aggregateRevenueByDay", () => {
  it("buckets orders by local calendar day", () => {
    const orders = [
      order({ created_at: "2026-06-10T04:00:00.000Z", total: 100 }), // 09:30 IST
      order({ created_at: "2026-06-10T20:00:00.000Z", total: 50 }), // next-day 01:30 IST
      order({ created_at: "2026-06-11T06:00:00.000Z", total: 25 }), // 11:30 IST
    ];

    const days = aggregateRevenueByDay(orders, "2026-06-10", "2026-06-11", TZ);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: "2026-06-10", value: 100 });
    expect(days[1]).toMatchObject({ date: "2026-06-11", value: 75 });
  });

  it("returns a zero-value bucket for days with no orders", () => {
    const days = aggregateRevenueByDay([], "2026-06-10", "2026-06-10", TZ);
    expect(days).toEqual([{ date: "2026-06-10", label: "Jun 10", value: 0 }]);
  });
});

describe("aggregateTopItems", () => {
  const items: ReportOrderItemRow[] = [
    { order_id: "o1", item_id: "i1", name: "Biryani", qty: 2, line_subtotal: 400, line_tax: 20 },
    { order_id: "o2", item_id: "i1", name: "Biryani", qty: 1, line_subtotal: 200, line_tax: 10 },
    { order_id: "o1", item_id: "i2", name: "Naan", qty: 4, line_subtotal: 80, line_tax: 4 },
  ];

  it("merges by name and sorts by revenue descending", () => {
    const result = aggregateTopItems(items);
    expect(result[0]).toEqual({ name: "Biryani", qty: 3, revenue: 630 });
    expect(result[1]).toEqual({ name: "Naan", qty: 4, revenue: 84 });
  });

  it("respects the limit", () => {
    expect(aggregateTopItems(items, 1)).toHaveLength(1);
  });
});

describe("aggregateCategoryPerformance", () => {
  const items: ReportOrderItemRow[] = [
    { order_id: "o1", item_id: "i1", name: "Biryani", qty: 2, line_subtotal: 400, line_tax: 20 },
    { order_id: "o1", item_id: "i2", name: "Gulab Jamun", qty: 2, line_subtotal: 100, line_tax: 5 },
    { order_id: "o1", item_id: "i3", name: "Mystery Item", qty: 1, line_subtotal: 50, line_tax: 0 },
  ];
  const categoryByItemId = new Map([
    ["i1", "Mains"],
    ["i2", "Desserts"],
  ]);

  it("groups by category and falls back to Uncategorized", () => {
    const result = aggregateCategoryPerformance(items, categoryByItemId);
    expect(result).toEqual([
      { category: "Mains", qty: 2, revenue: 420 },
      { category: "Desserts", qty: 2, revenue: 105 },
      { category: "Uncategorized", qty: 1, revenue: 50 },
    ]);
  });
});

describe("aggregatePaymentMethods", () => {
  it("counts and sums per method, omitting unused methods", () => {
    const orders = [
      order({ payment_method: "cash", total: 100 }),
      order({ payment_method: "cash", total: 50 }),
      order({ payment_method: "upi", total: 200 }),
    ];
    expect(aggregatePaymentMethods(orders)).toEqual([
      { method: "cash", count: 2, total: 150 },
      { method: "upi", count: 1, total: 200 },
    ]);
  });

  it("returns an empty array for no orders", () => {
    expect(aggregatePaymentMethods([])).toEqual([]);
  });
});

describe("buildSalesReportRows / salesReportToCsv", () => {
  it("shapes orders into report rows", () => {
    const rows = buildSalesReportRows([order({ order_number: 42, customer_name: "Asha" })], TZ);
    expect(rows[0]).toMatchObject({ orderNumber: 42, status: "served", paymentMethod: "cash", customer: "Asha", total: 105 });
  });

  it("renders CSV with a header row and escapes commas/quotes", () => {
    const rows = buildSalesReportRows([order({ order_number: 1, customer_name: 'Café, "VIP"' })], TZ);
    const csv = salesReportToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Order #,Date,Status,Payment method,Customer,Subtotal,Tax,Total");
    expect(lines[1]).toContain('"Café, ""VIP"""');
    expect(lines[1]).toContain("105.00");
  });

  it("defaults customer to an empty string", () => {
    const rows = buildSalesReportRows([order({ customer_name: null })], TZ);
    expect(rows[0].customer).toBe("");
  });
});
