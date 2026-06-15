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

  it("kitchen sees only dashboard and KOT", () => {
    const items = navForRole("kitchen");
    expect(items.map((i) => i.segment)).toEqual(["dashboard", "kot"]);
  });

  it("Kitchen (KOT) is live (no phase badge)", () => {
    const kot = NAV.find((i) => i.segment === "kot");
    expect(kot?.phase).toBeUndefined();
  });

  it("Inventory is live (no phase badge) and restricted to managing roles", () => {
    const inventory = NAV.find((i) => i.segment === "inventory");
    expect(inventory?.phase).toBeUndefined();
    expect(inventory?.roles).toEqual(["owner", "admin", "manager"]);
  });

  it("Accounting and Reports are live (no phase badge)", () => {
    const accounting = NAV.find((i) => i.segment === "accounting");
    expect(accounting?.phase).toBeUndefined();
    expect(accounting?.roles).toEqual(["owner", "admin"]);

    const reports = NAV.find((i) => i.segment === "reports");
    expect(reports?.phase).toBeUndefined();
    expect(reports?.roles).toEqual(["owner", "admin", "manager"]);
  });
});
