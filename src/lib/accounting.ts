/**
 * Pure validation/parsing for the daily closing form. The server action
 * calls this before touching the database; the daily_closings check
 * constraints (supabase/migrations/0010_reporting.sql) remain the final
 * authority.
 */
import { round2 } from "@/lib/menu";

export const MAX_CASH_AMOUNT = 9_999_999.99;
export const CLOSING_NOTES_MAX_LENGTH = 500;

export type DailyClosingInput = {
  openingCash: number;
  closingCash: number;
  cashRefunds: number;
  notes: string | null;
};

export type ParsedDailyClosing = { ok: true; input: DailyClosingInput } | { ok: false; error: string };

function parseAmount(raw: string, label: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (!trimmed || !Number.isFinite(value) || value < 0) return { ok: false, error: `${label} must be a number 0 or greater.` };
  if (value > MAX_CASH_AMOUNT) return { ok: false, error: `${label} is too large.` };
  return { ok: true, value: round2(value) };
}

/** Validates a daily-closing form submission (cash counts + optional notes). */
export function parseDailyClosingForm(fields: { openingCash: string; closingCash: string; cashRefunds: string; notes: string }): ParsedDailyClosing {
  const opening = parseAmount(fields.openingCash, "Opening cash");
  if (!opening.ok) return opening;

  const closing = parseAmount(fields.closingCash, "Closing cash");
  if (!closing.ok) return closing;

  const refunds = parseAmount(fields.cashRefunds, "Cash refunds");
  if (!refunds.ok) return refunds;

  const notes = fields.notes.trim();
  if (notes.length > CLOSING_NOTES_MAX_LENGTH) return { ok: false, error: `Notes must be ${CLOSING_NOTES_MAX_LENGTH} characters or fewer.` };

  return {
    ok: true,
    input: { openingCash: opening.value, closingCash: closing.value, cashRefunds: refunds.value, notes: notes || null },
  };
}
