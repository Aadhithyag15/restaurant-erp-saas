import { describe, expect, it } from "vitest";
import { validateCategoryName } from "@/lib/menu";

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
