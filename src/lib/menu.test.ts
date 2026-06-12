import { describe, expect, it } from "vitest";
import { parseItemForm, round2, validateCategoryName, type ParsedItem } from "@/lib/menu";

const errOf = (r: ParsedItem) => (r.ok ? undefined : r.error);
const inputOf = (r: ParsedItem) => (r.ok ? r.input : undefined);

describe("validateCategoryName", () => {
  it("accepts reasonable names", () => {
    expect(validateCategoryName("Starters")).toBeNull();
    expect(validateCategoryName("  Biryani & Rice  ")).toBeNull();
  });

  it("rejects too-short and too-long names", () => {
    expect(validateCategoryName("A")).not.toBeNull();
    expect(validateCategoryName(" ")).not.toBeNull();
    expect(validateCategoryName("x".repeat(41))).not.toBeNull();
  });
});

describe("round2", () => {
  it("rounds money correctly", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(2.675)).toBe(2.68); // classic float trap
    expect(round2(99)).toBe(99);
  });
});

describe("parseItemForm", () => {
  const valid = { name: "Chicken Biryani", categoryId: "", sku: "BIR-01", price: "249", taxRate: "5", isAvailable: "on", description: "" };

  it("parses a valid item", () => {
    const result = parseItemForm(valid);
    expect(result.ok).toBe(true);
    expect(inputOf(result)).toEqual({
      name: "Chicken Biryani",
      categoryId: null,
      sku: "BIR-01",
      price: 249,
      taxRate: 5,
      isAvailable: true,
      description: null,
    });
  });

  it("defaults empty tax to 0 and unchecked availability to false", () => {
    const input = inputOf(parseItemForm({ ...valid, taxRate: "", isAvailable: undefined }));
    expect(input?.taxRate).toBe(0);
    expect(input?.isAvailable).toBe(false);
  });

  it("rounds price and tax to 2 decimals", () => {
    const input = inputOf(parseItemForm({ ...valid, price: "10.005", taxRate: "2.675" }));
    expect(input?.price).toBe(10.01);
    expect(input?.taxRate).toBe(2.68);
  });

  it("rejects bad names", () => {
    expect(errOf(parseItemForm({ ...valid, name: "X" }))).toBeDefined();
    expect(errOf(parseItemForm({ ...valid, name: "x".repeat(81) }))).toBeDefined();
  });

  it("rejects bad prices", () => {
    for (const price of ["", "-1", "abc", "1e99"]) {
      expect(errOf(parseItemForm({ ...valid, price })), `price=${price}`).toBeDefined();
    }
  });

  it("rejects out-of-range tax", () => {
    expect(errOf(parseItemForm({ ...valid, taxRate: "101" }))).toBeDefined();
    expect(errOf(parseItemForm({ ...valid, taxRate: "-1" }))).toBeDefined();
  });

  it("rejects malformed SKUs but allows empty", () => {
    expect(errOf(parseItemForm({ ...valid, sku: "has space" }))).toBeDefined();
    expect(errOf(parseItemForm({ ...valid, sku: "x".repeat(41) }))).toBeDefined();
    expect(inputOf(parseItemForm({ ...valid, sku: "" }))?.sku).toBeNull();
  });

  it("rejects oversized descriptions", () => {
    expect(errOf(parseItemForm({ ...valid, description: "x".repeat(501) }))).toBeDefined();
  });
});
