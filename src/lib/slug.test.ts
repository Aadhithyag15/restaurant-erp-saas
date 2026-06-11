import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugify, validateSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases, hyphenates and trims", () => {
    expect(slugify("Chicken Story")).toBe("chicken-story");
    expect(slugify("  The Café! 24/7  ")).toBe("the-caf-24-7");
    expect(slugify("---hello---")).toBe("hello");
  });

  it("caps at 40 characters", () => {
    expect(slugify("a".repeat(60)).length).toBeLessThanOrEqual(40);
  });
});

describe("validateSlug", () => {
  it("accepts well-formed slugs", () => {
    expect(validateSlug("chicken-story")).toBeNull();
    expect(validateSlug("cafe24")).toBeNull();
  });

  it("rejects malformed slugs", () => {
    expect(validateSlug("ab")).not.toBeNull(); // too short
    expect(validateSlug("-bad")).not.toBeNull();
    expect(validateSlug("bad-")).not.toBeNull();
    expect(validateSlug("Bad")).not.toBeNull();
    expect(validateSlug("a".repeat(41))).not.toBeNull();
  });

  it("rejects every reserved app route", () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(validateSlug(reserved), reserved).not.toBeNull();
    }
  });
});
