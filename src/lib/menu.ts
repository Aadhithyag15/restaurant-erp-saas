/**
 * Pure validation/parsing for menu data. Server actions call these before
 * touching the database; the database constraints remain the final authority.
 */

export function validateCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    return "Category name must be 2-40 characters.";
  }
  return null;
}

export const SKU_REGEX = /^[A-Za-z0-9._-]{1,40}$/;
export const MAX_PRICE = 9_999_999.99;

export type ItemInput = {
  name: string;
  categoryId: string | null;
  sku: string | null;
  price: number;
  taxRate: number;
  isVeg: boolean;
  isAvailable: boolean;
  description: string | null;
};

export type ParsedItem = { ok: true; input: ItemInput } | { ok: false; error: string };

/** Round to 2 decimals, half away from zero — display/storage convention. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Parses raw form fields into a validated ItemInput.
 * Takes plain strings (not FormData) so it is trivially unit-testable.
 */
export function parseItemForm(raw: {
  name?: string;
  categoryId?: string;
  sku?: string;
  price?: string;
  taxRate?: string;
  isVeg?: string;
  isAvailable?: string;
  description?: string;
}): ParsedItem {
  const name = (raw.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Item name must be 2-80 characters." };

  const sku = (raw.sku ?? "").trim();
  if (sku && !SKU_REGEX.test(sku)) {
    return { ok: false, error: "SKU may use letters, numbers, dots, hyphens and underscores (max 40)." };
  }

  const priceRaw = (raw.price ?? "").trim();
  const price = Number(priceRaw);
  if (!priceRaw || !Number.isFinite(price) || price < 0) return { ok: false, error: "Enter a valid price (0 or more)." };
  if (price > MAX_PRICE) return { ok: false, error: "Price is too large." };

  const taxRaw = (raw.taxRate ?? "").trim();
  const taxRate = taxRaw === "" ? 0 : Number(taxRaw);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { ok: false, error: "Tax % must be between 0 and 100." };
  }

  const description = (raw.description ?? "").trim();
  if (description.length > 500) return { ok: false, error: "Description must be 500 characters or fewer." };

  const categoryId = (raw.categoryId ?? "").trim();

  return {
    ok: true,
    input: {
      name,
      categoryId: categoryId === "" ? null : categoryId,
      sku: sku === "" ? null : sku,
      price: round2(price),
      taxRate: round2(taxRate),
      isVeg: raw.isVeg === "on" || raw.isVeg === "true",
      isAvailable: raw.isAvailable === "on" || raw.isAvailable === "true",
      description: description === "" ? null : description,
    },
  };
}
