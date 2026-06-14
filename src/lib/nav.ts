import {
  BookOpen,
  Calculator,
  ChefHat,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
} from "lucide-react";
import type { MemberRole } from "@/types/database";

export type NavItem = {
  label: string;
  segment: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: MemberRole[];
  /** set = not built yet; rendered disabled with a "soon" badge */
  phase?: string;
};

export const NAV: NavItem[] = [
  { label: "Dashboard", segment: "dashboard", icon: LayoutDashboard, roles: ["owner", "admin", "manager", "cashier", "kitchen"] },
  { label: "POS", segment: "pos", icon: ShoppingCart, roles: ["owner", "admin", "manager", "cashier"] },
  { label: "Menu manager", segment: "menu", icon: BookOpen, roles: ["owner", "admin", "manager"] },
  { label: "Kitchen (KOT)", segment: "kot", icon: ChefHat, roles: ["owner", "admin", "manager", "kitchen"] },
  { label: "Inventory", segment: "inventory", icon: Package, roles: ["owner", "admin", "manager"], phase: "Phase 5" },
  { label: "Accounting", segment: "accounting", icon: Calculator, roles: ["owner", "admin"], phase: "Phase 6" },
  { label: "Reports", segment: "reports", icon: FileSpreadsheet, roles: ["owner", "admin", "manager"], phase: "Phase 6" },
  { label: "Billing", segment: "billing", icon: CreditCard, roles: ["owner", "admin"] },
  { label: "Settings", segment: "settings", icon: Settings, roles: ["owner", "admin"] },
];

export function navForRole(role: MemberRole): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}
