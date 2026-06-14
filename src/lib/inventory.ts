import { round2 } from "@/lib/menu";
import type { InventoryTransactionType } from "@/types/database";

/**
 * Pure validation/parsing for inventory data, mirroring lib/menu.ts. Server
 * actions and RPCs call these before touching the database; the database
 * constraints (supabase/migrations/0009_inventory.sql) remain the final
 * authority.
 */

export const INVENTORY_UNITS = ["kg", "g", "litre", "ml", "pieces", "dozen", "packet", "box", "bottle", "tin"] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const INVENTORY_UNIT_LABELS: Record<InventoryUnit, string> = {
  kg: "kg",
  g: "g",
  litre: "litre",
  ml: "ml",
  pieces: "pieces",
  dozen: "dozen",
  packet: "packet",
  box: "box",
  bottle: "bottle",
  tin: "tin",
};

export const TRANSACTION_TYPE_LABELS: Record<InventoryTransactionType, string> = {
  purchase: "Purchase",
  waste: "Waste",
  adjustment: "Adjustment",
  correction: "Correction",
  sale: "Sale",
};

export const TRANSACTION_TYPE_BADGE_CLASS: Record<InventoryTransactionType, string> = {
  purchase: "bg-success/15 text-success",
  waste: "bg-destructive/10 text-destructive",
  adjustment: "bg-secondary text-secondary-foreground",
  correction: "bg-warning/15 text-warning",
  sale: "border border-input text-muted-foreground",
};

export const MAX_QUANTITY = 999_999.999;
export const MAX_COST = 9_999_999.99;

/** Round to 3 decimals, half away from zero — stock-quantity convention. */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export type IngredientInput = {
  name: string;
  unit: InventoryUnit;
  minimumStock: number;
  costPerUnit: number;
};

export type ParsedIngredient = { ok: true; input: IngredientInput } | { ok: false; error: string };

/** Parses raw form fields into a validated IngredientInput. */
export function parseIngredientForm(raw: { name?: string; unit?: string; minimumStock?: string; costPerUnit?: string }): ParsedIngredient {
  const name = (raw.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Ingredient name must be 2-80 characters." };

  const unit = (raw.unit ?? "").trim();
  if (!(INVENTORY_UNITS as readonly string[]).includes(unit)) {
    return { ok: false, error: "Choose a valid unit." };
  }

  const minRaw = (raw.minimumStock ?? "").trim();
  const minimumStock = minRaw === "" ? 0 : Number(minRaw);
  if (!Number.isFinite(minimumStock) || minimumStock < 0) return { ok: false, error: "Minimum stock must be 0 or more." };
  if (minimumStock > MAX_QUANTITY) return { ok: false, error: "Minimum stock is too large." };

  const costRaw = (raw.costPerUnit ?? "").trim();
  const costPerUnit = costRaw === "" ? 0 : Number(costRaw);
  if (!Number.isFinite(costPerUnit) || costPerUnit < 0) return { ok: false, error: "Cost per unit must be 0 or more." };
  if (costPerUnit > MAX_COST) return { ok: false, error: "Cost per unit is too large." };

  return {
    ok: true,
    input: {
      name,
      unit: unit as InventoryUnit,
      minimumStock: round3(minimumStock),
      costPerUnit: round2(costPerUnit),
    },
  };
}

export type RecipeLineInput = { ingredientId: string; quantity: number };
export type ParsedRecipeLine = { ok: true; input: RecipeLineInput } | { ok: false; error: string };

/** Parses raw form fields into a validated recipe (BOM) line. */
export function parseRecipeLineForm(raw: { ingredientId?: string; quantity?: string }): ParsedRecipeLine {
  const ingredientId = (raw.ingredientId ?? "").trim();
  if (!ingredientId) return { ok: false, error: "Choose an ingredient." };

  const qtyRaw = (raw.quantity ?? "").trim();
  const quantity = Number(qtyRaw);
  if (!qtyRaw || !Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: "Enter a quantity greater than 0." };
  if (quantity > MAX_QUANTITY) return { ok: false, error: "Quantity is too large." };

  return { ok: true, input: { ingredientId, quantity: round3(quantity) } };
}

export type StockMovementInput = { quantityChange: number; unitCost: number | null; notes: string | null };
export type ParsedStockMovement = { ok: true; input: StockMovementInput } | { ok: false; error: string };

/**
 * Parses a purchase/waste/adjustment form. `type` decides the required sign
 * of the quantity: purchases must increase stock, waste must decrease it,
 * adjustments may go either way.
 */
export function parseStockMovementForm(
  type: "purchase" | "waste" | "adjustment",
  raw: { quantity?: string; unitCost?: string; notes?: string },
): ParsedStockMovement {
  const qtyRaw = (raw.quantity ?? "").trim();
  let quantity = Number(qtyRaw);
  if (!qtyRaw || !Number.isFinite(quantity) || quantity === 0) return { ok: false, error: "Enter a non-zero quantity." };
  if (Math.abs(quantity) > MAX_QUANTITY) return { ok: false, error: "Quantity is too large." };

  if (type === "purchase") quantity = Math.abs(quantity);
  if (type === "waste") quantity = -Math.abs(quantity);

  const costRaw = (raw.unitCost ?? "").trim();
  let unitCost: number | null = null;
  if (costRaw !== "") {
    unitCost = Number(costRaw);
    if (!Number.isFinite(unitCost) || unitCost < 0) return { ok: false, error: "Unit cost must be 0 or more." };
    if (unitCost > MAX_COST) return { ok: false, error: "Unit cost is too large." };
    unitCost = round2(unitCost);
  }

  const notes = (raw.notes ?? "").trim();
  if (notes.length > 500) return { ok: false, error: "Notes must be 500 characters or fewer." };

  return { ok: true, input: { quantityChange: round3(quantity), unitCost, notes: notes === "" ? null : notes } };
}

export type StockCorrectionInput = { newStock: number; notes: string | null };
export type ParsedStockCorrection = { ok: true; input: StockCorrectionInput } | { ok: false; error: string };

/** Parses a stock-correction form (set stock to an absolute, known value). */
export function parseStockCorrectionForm(raw: { newStock?: string; notes?: string }): ParsedStockCorrection {
  const stockRaw = (raw.newStock ?? "").trim();
  const newStock = Number(stockRaw);
  if (!stockRaw || !Number.isFinite(newStock) || newStock < 0) return { ok: false, error: "Enter a stock level of 0 or more." };
  if (newStock > MAX_QUANTITY) return { ok: false, error: "Stock level is too large." };

  const notes = (raw.notes ?? "").trim();
  if (notes.length > 500) return { ok: false, error: "Notes must be 500 characters or fewer." };

  return { ok: true, input: { newStock: round3(newStock), notes: notes === "" ? null : notes } };
}

export type StockLevel = { current_stock: number; minimum_stock: number };

/** True when an ingredient is at or below its configured minimum. */
export function isLowStock(ingredient: StockLevel): boolean {
  return ingredient.current_stock <= ingredient.minimum_stock;
}

export type StockValue = { current_stock: number; cost_per_unit: number };

/** Inventory value of a single ingredient (stock on hand × unit cost). */
export function stockValue(ingredient: StockValue): number {
  return round2(ingredient.current_stock * ingredient.cost_per_unit);
}
