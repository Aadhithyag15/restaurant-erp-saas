/**
 * Pure validation for menu data. Server actions call these before touching
 * the database; the database constraints remain the final authority.
 */

export function validateCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    return "Category name must be 2–40 characters.";
  }
  return null;
}
