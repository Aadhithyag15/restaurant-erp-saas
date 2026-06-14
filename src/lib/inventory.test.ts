import { describe, expect, it } from "vitest";
import {
  isLowStock,
  parseIngredientForm,
  parseRecipeLineForm,
  parseStockCorrectionForm,
  parseStockMovementForm,
  round3,
  stockValue,
  type ParsedIngredient,
  type ParsedRecipeLine,
  type ParsedStockCorrection,
  type ParsedStockMovement,
} from "@/lib/inventory";

const errOf = <T extends { ok: boolean; error?: string }>(r: T) => (r.ok ? undefined : r.error);

function inputOf<T extends { ok: boolean }>(r: T): (T extends { ok: true; input: infer I } ? I : never) | undefined {
  return (r.ok ? (r as unknown as { input: unknown }).input : undefined) as (T extends { ok: true; input: infer I } ? I : never) | undefined;
}

describe("round3", () => {
  it("rounds quantities to 3 decimals", () => {
    expect(round3(0.12345)).toBe(0.123);
    expect(round3(0.2505)).toBe(0.251);
    expect(round3(1)).toBe(1);
  });
});

describe("parseIngredientForm", () => {
  const valid = { name: "Basmati Rice", unit: "kg", minimumStock: "5", costPerUnit: "120" };

  it("parses a valid ingredient", () => {
    const result = parseIngredientForm(valid);
    expect(result.ok).toBe(true);
    expect(inputOf<ParsedIngredient>(result)).toEqual({
      name: "Basmati Rice",
      unit: "kg",
      minimumStock: 5,
      costPerUnit: 120,
    });
  });

  it("defaults empty minimum stock and cost to 0", () => {
    const input = inputOf<ParsedIngredient>(parseIngredientForm({ ...valid, minimumStock: "", costPerUnit: "" }));
    expect(input?.minimumStock).toBe(0);
    expect(input?.costPerUnit).toBe(0);
  });

  it("rejects bad names", () => {
    expect(errOf(parseIngredientForm({ ...valid, name: "X" }))).toBeDefined();
    expect(errOf(parseIngredientForm({ ...valid, name: "x".repeat(81) }))).toBeDefined();
  });

  it("rejects unknown units", () => {
    expect(errOf(parseIngredientForm({ ...valid, unit: "gallons" }))).toBeDefined();
  });

  it("rejects negative minimum stock or cost", () => {
    expect(errOf(parseIngredientForm({ ...valid, minimumStock: "-1" }))).toBeDefined();
    expect(errOf(parseIngredientForm({ ...valid, costPerUnit: "-1" }))).toBeDefined();
  });
});

describe("parseRecipeLineForm", () => {
  it("parses a valid line", () => {
    const result = parseRecipeLineForm({ ingredientId: "abc-123", quantity: "0.25" });
    expect(inputOf<ParsedRecipeLine>(result)).toEqual({ ingredientId: "abc-123", quantity: 0.25 });
  });

  it("requires an ingredient", () => {
    expect(errOf(parseRecipeLineForm({ ingredientId: "", quantity: "1" }))).toBeDefined();
  });

  it("rejects zero or negative quantity", () => {
    expect(errOf(parseRecipeLineForm({ ingredientId: "abc", quantity: "0" }))).toBeDefined();
    expect(errOf(parseRecipeLineForm({ ingredientId: "abc", quantity: "-1" }))).toBeDefined();
  });
});

describe("parseStockMovementForm", () => {
  it("forces purchases positive and waste negative regardless of sign entered", () => {
    expect(inputOf<ParsedStockMovement>(parseStockMovementForm("purchase", { quantity: "-10" }))?.quantityChange).toBe(10);
    expect(inputOf<ParsedStockMovement>(parseStockMovementForm("waste", { quantity: "5" }))?.quantityChange).toBe(-5);
  });

  it("allows adjustments in either direction", () => {
    expect(inputOf<ParsedStockMovement>(parseStockMovementForm("adjustment", { quantity: "-2.5" }))?.quantityChange).toBe(-2.5);
    expect(inputOf<ParsedStockMovement>(parseStockMovementForm("adjustment", { quantity: "2.5" }))?.quantityChange).toBe(2.5);
  });

  it("rejects zero quantity", () => {
    expect(errOf(parseStockMovementForm("adjustment", { quantity: "0" }))).toBeDefined();
  });

  it("parses optional unit cost and notes", () => {
    const input = inputOf<ParsedStockMovement>(parseStockMovementForm("purchase", { quantity: "10", unitCost: "12.345", notes: "  weekly order  " }));
    expect(input?.unitCost).toBe(12.35);
    expect(input?.notes).toBe("weekly order");
  });

  it("rejects negative unit cost", () => {
    expect(errOf(parseStockMovementForm("purchase", { quantity: "10", unitCost: "-1" }))).toBeDefined();
  });
});

describe("parseStockCorrectionForm", () => {
  it("parses a valid correction", () => {
    const input = inputOf<ParsedStockCorrection>(parseStockCorrectionForm({ newStock: "12.5", notes: "physical count" }));
    expect(input).toEqual({ newStock: 12.5, notes: "physical count" });
  });

  it("rejects negative or missing stock", () => {
    expect(errOf(parseStockCorrectionForm({ newStock: "-1" }))).toBeDefined();
    expect(errOf(parseStockCorrectionForm({ newStock: "" }))).toBeDefined();
  });
});

describe("isLowStock", () => {
  it("flags stock at or below minimum", () => {
    expect(isLowStock({ current_stock: 2, minimum_stock: 5 })).toBe(true);
    expect(isLowStock({ current_stock: 5, minimum_stock: 5 })).toBe(true);
    expect(isLowStock({ current_stock: 6, minimum_stock: 5 })).toBe(false);
  });
});

describe("stockValue", () => {
  it("multiplies stock by unit cost and rounds to 2 decimals", () => {
    expect(stockValue({ current_stock: 2.5, cost_per_unit: 119.98 })).toBe(299.95);
  });
});
