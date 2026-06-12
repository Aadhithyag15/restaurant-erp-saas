import { describe, expect, it } from "vitest";
import { NAV, navForRole } from "@/lib/nav";

describe("navigation config", () => {
  it("has unique segments", () => {
    const segments = NAV.map((i) => i.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("POS is live (no phase badge) and reachable by cashiers", () => {
    const pos = NAV.find((i) => i.segment === "pos");
    expect(pos).toBeDefined();
    expect(pos?.phase).toBeUndefined();
    expect(pos?.roles).toContain("cashier");
  });

  it("Menu manager is restricted to managing roles", () => {
    const menu = NAV.find((i) => i.segment === "menu");
    expect(menu?.phase).toBeUndefined();
    expect(menu?.roles).toEqual(["owner", "admin", "manager"]);
  });

  it("cashiers see POS but not settings, billing or menu manager", () => {
    const segments = navForRole("cashier").map((i) => i.segment);
    expect(segments).toContain("pos");
    expect(segments).not.toContain("settings");
    expect(segments).not.toContain("billing");
    expect(segments).not.toContain("menu");
  });

  it("kitchen sees only dashboard and (future) KOT", () => {
    const items = navForRole("kitchen");
    expect(items.map((i) => i.segment)).toEqual(["dashboard", "kot"]);
  });

  it("unbuilt modules stay phase-gated", () => {
    for (const segment of ["kot", "inventory", "accounting", "reports"]) {
      expect(NAV.find((i) => i.segment === segment)?.phase, segment).toBeDefined();
    }
  });
});
