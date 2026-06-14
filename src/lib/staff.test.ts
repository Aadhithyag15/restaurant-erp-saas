import { describe, expect, it } from "vitest";
import { INVITABLE_ROLES, normalizeEmail, validateInviteEmail, validateInviteRole } from "@/lib/staff";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Staff@Example.com  ")).toBe("staff@example.com");
  });
});

describe("validateInviteEmail", () => {
  it("accepts well-formed emails", () => {
    expect(validateInviteEmail("staff@example.com")).toBeNull();
    expect(validateInviteEmail("a.b+c@sub.example.co")).toBeNull();
  });

  it("rejects malformed or oversized emails", () => {
    expect(validateInviteEmail("not-an-email")).not.toBeNull();
    expect(validateInviteEmail("missing@domain")).not.toBeNull();
    expect(validateInviteEmail("@example.com")).not.toBeNull();
    expect(validateInviteEmail(`a${"x".repeat(250)}@example.com`)).not.toBeNull();
  });
});

describe("validateInviteRole", () => {
  it("accepts every invitable role", () => {
    for (const role of INVITABLE_ROLES) {
      expect(validateInviteRole(role)).toBe(role);
    }
  });

  it("rejects owner and unknown roles", () => {
    expect(validateInviteRole("owner")).toBeNull();
    expect(validateInviteRole("superadmin")).toBeNull();
    expect(validateInviteRole("")).toBeNull();
  });
});
