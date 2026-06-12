import { describe, expect, it } from "vitest";
import type { CartItem, CartLine } from "@/lib/cart";
import { cartStorageKey, deserializeCart, serializeCart } from "@/lib/cart-storage";

const lines: CartLine[] = [
  { itemId: "a", name: "Biryani", price: 249, taxRate: 5, qty: 2 },
  { itemId: "b", name: "Tea", price: 15.5, taxRate: 0, qty: 1 },
];

describe("cart storage", () => {
  it("keys carts per tenant", () => {
    expect(cartStorageKey("chicken-story")).not.toBe(cartStorageKey("other-place"));
  });

  it("round-trips a cart", () => {
    expect(deserializeCart(serializeCart(lines))).toEqual(lines);
  });

  it("returns empty for null, bad JSON, wrong version and junk shapes", () => {
    expect(deserializeCart(null)).toEqual([]);
    expect(deserializeCart("{not json")).toEqual([]);
    expect(deserializeCart(JSON.stringify({ v: 99, lines }))).toEqual([]);
    expect(deserializeCart(JSON.stringify({ v: 1, lines: "nope" }))).toEqual([]);
    expect(deserializeCart(JSON.stringify([1, 2, 3]))).toEqual([]);
  });

  it("filters junk lines but keeps valid ones", () => {
    const raw = JSON.stringify({
      v: 1,
      lines: [
        lines[0],
        { itemId: "", name: "x", price: 1, taxRate: 0, qty: 1 }, // empty id
        { itemId: "c", name: "", price: 1, taxRate: 0, qty: 1 }, // empty name
        { itemId: "d", name: "x", price: -5, taxRate: 0, qty: 1 }, // negative price
        { itemId: "e", name: "x", price: 1, taxRate: 200, qty: 1 }, // silly tax
        { itemId: "f", name: "x", price: 1, taxRate: 0, qty: 0 }, // zero qty
        { itemId: "a", name: "dupe", price: 1, taxRate: 0, qty: 1 }, // duplicate id
        "garbage",
      ],
    });
    expect(deserializeCart(raw)).toEqual([lines[0]]);
  });

  it("clamps restored quantities", () => {
    const raw = JSON.stringify({ v: 1, lines: [{ ...lines[0], qty: 5000.9 }] });
    expect(deserializeCart(raw)[0].qty).toBe(99);
  });

  it("re-anchors to the live menu: drops vanished items, takes live prices", () => {
    const live = new Map<string, CartItem>([
      // biryani price changed since the cart was stored
      ["a", { itemId: "a", name: "Chicken Biryani", price: 299, taxRate: 12 }],
      // "b" (tea) no longer on the menu
    ]);
    const restored = deserializeCart(serializeCart(lines), live);
    expect(restored).toEqual([{ itemId: "a", name: "Chicken Biryani", price: 299, taxRate: 12, qty: 2 }]);
  });
});
