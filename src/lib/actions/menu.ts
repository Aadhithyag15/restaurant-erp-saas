"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateCategoryName } from "@/lib/menu";

export type MenuActionState = { error: string } | null;

/**
 * Menu CRUD server actions. Authorization is NOT decided here — RLS enforces
 * role (owner/admin/manager) and license state on every statement; these
 * actions just validate input and translate database errors for humans.
 */

const UNIQUE_VIOLATION = "23505";

export async function createCategory(tenantId: string, slug: string, _prev: MenuActionState, formData: FormData): Promise<MenuActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const nameError = validateCategoryName(name);
  if (nameError) return { error: nameError };

  const supabase = await createClient();
  const { error } = await supabase.from("menu_categories").insert({ tenant_id: tenantId, name });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: `"${name}" already exists.` };
    return { error: "Could not create the category — check your permissions and license." };
  }

  revalidatePath(`/${slug}/menu`);
  return null;
}

export async function renameCategory(
  tenantId: string,
  slug: string,
  categoryId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const nameError = validateCategoryName(name);
  if (nameError) return { error: nameError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_categories")
    .update({ name })
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: `"${name}" already exists.` };
    return { error: "Could not rename the category." };
  }

  revalidatePath(`/${slug}/menu`);
  return null;
}

export async function deleteCategory(tenantId: string, slug: string, categoryId: string): Promise<void> {
  const supabase = await createClient();
  // RLS scopes the delete; the audit trigger records it. Items in this
  // category are detached (FK on delete set null), never deleted.
  await supabase.from("menu_categories").delete().eq("id", categoryId).eq("tenant_id", tenantId);
  revalidatePath(`/${slug}/menu`);
}
