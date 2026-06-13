import { describe, expect, it } from "vitest";
import {
  addToCart,
  cartCount,
  cartTotals,
  lineSubtotal,
  lineTax,
  MAX_QTY,
  removeFromCart,
  setQuantity,
  toOrderPayload,
  type CartLine,
} from "@/lib/cart";

const biryani = { itemId: "a", name: "Biryani", price: 249, taxRate: 5 };
const tea = { itemId: "b", name: "Tea", price: 15.5, taxRate: 0 };

describe("cart operations", () => {
  it("adds new items and increments existing ones", () => {
    let lines = addToCart([], biryani);
    lines = addToCart(lines, biryani);
    lines = addToCart(lines, tea);
    expect(lines).toHaveLength(2);
    expect(lines[0].qty).toBe(2);
    expect(cartCount(lines)).toBe(3);
  });

  it("never mutates the input array", () => {
    const original: CartLine[] = [{ ...biryani, qty: 1 }];
    addToCart(original, biryani);
    setQuantity(original, "a", 5);
    removeFromCart(original, "a");
    expect(original).toEqual([{ ...biryani, qty: 1 }]);
  });

  it("caps quantity at MAX_QTY", () => {
    let lines: CartLine[] = [{ ...biryani, qty: MAX_QTY }];
    lines = addToCart(lines, biryani);
    expect(lines[0].qty).toBe(MAX_QTY);
    expect(setQuantity(lines, "a", 500)[0].qty).toBe(MAX_QTY);
  });

  it("removes the line when quantity drops to zero", () => {
    const lines: CartLine[] = [{ ...biryani, qty: 1 }];
    expect(setQuantity(lines, "a", 0)).toHaveLength(0);
    expect(setQuantity(lines, "a", -3)).toHaveLength(0);
  });

  it("ignores junk quantities and floors fractions", () => {
    const lines: CartLine[] = [{ ...biryani, qty: 2 }];
    expect(setQuantity(lines, "a", NaN)).toEqual(lines);
    expect(setQuantity(lines, "a", 2.9)[0].qty).toBe(2);
  });
});

describe("cart math", () => {
  it("computes line subtotal and tax with 2-decimal rounding", () => {
    const line: CartLine = { ...tea, qty: 3 }; // 46.50
    expect(lineSubtotal(line)).toBe(46.5);
    expect(lineTax(line)).toBe(0);

    const taxed: CartLine = { itemId: "c", name: "X", price: 33.33, taxRate: 5, qty: 1 };
    expect(lineTax(taxed)).toBe(1.67); // 1.6665 → 1.67
  });

  it("computes cart totals", () => {
    const lines: CartLine[] = [
      { ...biryani, qty: 2 }, // 498.00, tax 24.90
      { ...tea, qty: 1 }, // 15.50, tax 0
    ];
    expect(cartTotals(lines)).toEqual({ subtotal: 513.5, tax: 24.9, total: 538.4 });
  });

  it("returns zeros for an empty cart", () => {
    expect(cartTotals([])).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });
});

describe("toOrderPayload", () => {
  it("maps cart lines to item_id/qty pairs for the place_order RPC", () => {
    const lines: CartLine[] = [{ ...biryani, qty: 2 }, { ...tea, qty: 1 }];
    expect(toOrderPayload(lines)).toEqual([
      { item_id: "a", qty: 2 },
      { item_id: "b", qty: 1 },
    ]);
  });

  it("returns an empty array for an empty cart", () => {
    expect(toOrderPayload([])).toEqual([]);
  });
});
