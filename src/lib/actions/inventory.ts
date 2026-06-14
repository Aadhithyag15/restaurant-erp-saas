"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseIngredientForm,
  parseRecipeLineForm,
  parseStockCorrectionForm,
  parseStockMovementForm,
} from "@/lib/inventory";
import type { Json } from "@/types/database";

export type InventoryActionState = { error: string } | null;

const UNIQUE_VIOLATION = "23505";

/**
 * Inventory CRUD + transaction server actions. Authorization is NOT decided
 * here — RLS enforces role (owner/admin/manager) and license state on every
 * statement, and the record_inventory_transaction()/correct_stock() RPCs
 * (supabase/migrations/0009_inventory.sql) are the only path to current_stock.
 * These actions just validate input and translate database errors for humans.
 */

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

function ingredientFieldsFrom(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    unit: String(formData.get("unit") ?? ""),
    minimumStock: String(formData.get("minimum_stock") ?? ""),
    costPerUnit: String(formData.get("cost_per_unit") ?? ""),
  };
}

export async function createIngredient(tenantId: string, slug: string, _prev: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const parsed = parseIngredientForm(ingredientFieldsFrom(formData));
  if (!parsed.ok) return { error: parsed.error };
  const { input } = parsed;

  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").insert({
    tenant_id: tenantId,
    name: input.name,
    unit: input.unit,
    minimum_stock: input.minimumStock,
    cost_per_unit: input.costPerUnit,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: `"${input.name}" already exists.` };
    return { error: "Could not create the ingredient — check your permissions and license." };
  }

  revalidatePath(`/${slug}/inventory`);
  return null;
}

export async function updateIngredient(
  tenantId: string,
  slug: string,
  ingredientId: string,
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = parseIngredientForm(ingredientFieldsFrom(formData));
  if (!parsed.ok) return { error: parsed.error };
  const { input } = parsed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("ingredients")
    .update({ name: input.name, unit: input.unit, minimum_stock: input.minimumStock, cost_per_unit: input.costPerUnit })
    .eq("id", ingredientId)
    .eq("tenant_id", tenantId);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: `"${input.name}" already exists.` };
    return { error: "Could not update the ingredient." };
  }

  revalidatePath(`/${slug}/inventory`);
  return null;
}

export async function deleteIngredient(tenantId: string, slug: string, ingredientId: string): Promise<void> {
  const supabase = await createClient();
  // RLS scopes the delete; the audit trigger records it. Recipe lines that
  // reference this ingredient are removed too (FK on delete cascade).
  await supabase.from("ingredients").delete().eq("id", ingredientId).eq("tenant_id", tenantId);
  revalidatePath(`/${slug}/inventory`);
}

// ---------------------------------------------------------------------------
// Recipes / BOM
// ---------------------------------------------------------------------------

export async function createRecipeLine(
  tenantId: string,
  slug: string,
  menuItemId: string,
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = parseRecipeLineForm({
    ingredientId: String(formData.get("ingredient_id") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error };
  const { input } = parsed;

  const supabase = await createClient();
  const { error } = await supabase.from("menu_item_ingredients").insert({
    tenant_id: tenantId,
    menu_item_id: menuItemId,
    ingredient_id: input.ingredientId,
    quantity: input.quantity,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: "This ingredient is already in the recipe." };
    return { error: "Could not add the ingredient to the recipe." };
  }

  revalidatePath(`/${slug}/inventory`);
  return null;
}

export async function updateRecipeLine(
  tenantId: string,
  slug: string,
  lineId: string,
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = Number(quantityRaw);
  if (!quantityRaw || !Number.isFinite(quantity) || quantity <= 0) return { error: "Enter a quantity greater than 0." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_item_ingredients")
    .update({ quantity: Math.round(quantity * 1000) / 1000 })
    .eq("id", lineId)
    .eq("tenant_id", tenantId);
  if (error) return { error: "Could not update the recipe line." };

  revalidatePath(`/${slug}/inventory`);
  return null;
}

export async function deleteRecipeLine(tenantId: string, slug: string, lineId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("menu_item_ingredients").delete().eq("id", lineId).eq("tenant_id", tenantId);
  revalidatePath(`/${slug}/inventory`);
}

// ---------------------------------------------------------------------------
// Stock transactions (purchases, waste, manual adjustments, corrections)
// ---------------------------------------------------------------------------

const MOVEMENT_TYPES = ["purchase", "waste", "adjustment"] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

export async function recordStockMovement(
  tenantId: string,
  slug: string,
  ingredientId: string,
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const type = String(formData.get("type") ?? "");
  if (!(MOVEMENT_TYPES as readonly string[]).includes(type)) return { error: "Choose a transaction type." };

  const parsed = parseStockMovementForm(type as MovementType, {
    quantity: String(formData.get("quantity") ?? ""),
    unitCost: String(formData.get("unit_cost") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error };
  const { input } = parsed;

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_inventory_transaction", {
    p_tenant: tenantId,
    p_ingredient: ingredientId,
    p_type: type as MovementType,
    p_quantity_change: input.quantityChange,
    p_unit_cost: input.unitCost,
    p_notes: input.notes,
  });
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/inventory`);
  return null;
}

export async function correctStock(
  tenantId: string,
  slug: string,
  ingredientId: string,
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = parseStockCorrectionForm({
    newStock: String(formData.get("new_stock") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error };
  const { input } = parsed;

  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_stock", {
    p_tenant: tenantId,
    p_ingredient: ingredientId,
    p_new_stock: input.newStock,
    p_notes: input.notes,
  });
  if (error) return { error: error.message };

  revalidatePath(`/${slug}/inventory`);
  return null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Owner/admin toggle for whether stock may go negative (tenants.settings is owner/admin writable). */
export async function setAllowNegativeStock(tenantId: string, slug: string, allow: boolean): Promise<InventoryActionState> {
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  const settings = (tenant?.settings ?? {}) as Record<string, Json>;
  const inventorySettings = (settings.inventory ?? {}) as Record<string, Json>;

  const { error } = await supabase
    .from("tenants")
    .update({ settings: { ...settings, inventory: { ...inventorySettings, allow_negative_stock: allow } } })
    .eq("id", tenantId);
  if (error) return { error: "Could not save — only owners and admins can change this." };

  revalidatePath(`/${slug}/inventory`);
  return null;
}
