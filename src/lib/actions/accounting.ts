"use server";

import { revalidatePath } from "next/cache";
import { parseDailyClosingForm } from "@/lib/accounting";
import { createClient } from "@/lib/supabase/server";

export type AccountingActionState = { error: string } | null;

/**
 * Upserts the daily cash-closing record for one tenant/date. RLS restricts
 * this table to owner/admin (supabase/migrations/0010_reporting.sql); sales
 * totals are derived from `orders` at report time and never stored here.
 */
export async function recordDailyClosing(
  tenantId: string,
  slug: string,
  closingDate: string,
  _prev: AccountingActionState,
  formData: FormData,
): Promise<AccountingActionState> {
  const parsed = parseDailyClosingForm({
    openingCash: String(formData.get("opening_cash") ?? ""),
    closingCash: String(formData.get("closing_cash") ?? ""),
    cashRefunds: String(formData.get("cash_refunds") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error };
  const { input } = parsed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("daily_closings").upsert(
    {
      tenant_id: tenantId,
      closing_date: closingDate,
      opening_cash: input.openingCash,
      closing_cash: input.closingCash,
      cash_refunds: input.cashRefunds,
      notes: input.notes,
      closed_by: user?.id ?? null,
    },
    { onConflict: "tenant_id,closing_date" },
  );
  if (error) return { error: "Could not save the daily closing — check your permissions and license." };

  revalidatePath(`/${slug}/accounting`);
  return null;
}
