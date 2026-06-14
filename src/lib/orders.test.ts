import { describe, expect, it } from "vitest";
import {
  ORDER_STATUSES,
  parseDateFilter,
  parseOrderNumberQuery,
  parsePageParam,
  parseStatusFilter,
  sourceLabel,
} from "@/lib/orders";

describe("sourceLabel", () => {
  it("title-cases snake_case sources", () => {
    expect(sourceLabel("walk_in")).toBe("Walk In");
    expect(sourceLabel("word_of_mouth")).toBe("Word Of Mouth");
    expect(sourceLabel("zomato")).toBe("Zomato");
  });
});

describe("parseOrderNumberQuery", () => {
  it("accepts positive integers", () => {
    expect(parseOrderNumberQuery("1024")).toBe(1024);
    expect(parseOrderNumberQuery("  7 ".trim())).toBe(7);
  });

  it("rejects non-numeric, zero and negative input", () => {
    expect(parseOrderNumberQuery("abc")).toBeNull();
    expect(parseOrderNumberQuery("0")).toBeNull();
    expect(parseOrderNumberQuery("-5")).toBeNull();
    expect(parseOrderNumberQuery("12.5")).toBeNull();
    expect(parseOrderNumberQuery("")).toBeNull();
  });
});

describe("parsePageParam", () => {
  it("defaults to 1 for missing/invalid values", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-3")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
  });

  it("parses valid page numbers", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(["2", "5"])).toBe(2);
  });
});

describe("parseStatusFilter", () => {
  it("accepts every order status", () => {
    for (const status of ORDER_STATUSES) {
      expect(parseStatusFilter(status)).toBe(status);
    }
  });

  it("returns null for missing or unknown values", () => {
    expect(parseStatusFilter(undefined)).toBeNull();
    expect(parseStatusFilter("")).toBeNull();
    expect(parseStatusFilter("cancelled")).toBeNull();
  });
});

describe("parseDateFilter", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(parseDateFilter("2026-06-14")).toBe("2026-06-14");
  });

  it("rejects malformed dates", () => {
    expect(parseDateFilter("14-06-2026")).toBe("");
    expect(parseDateFilter("2026/06/14")).toBe("");
    expect(parseDateFilter(undefined)).toBe("");
  });
});
