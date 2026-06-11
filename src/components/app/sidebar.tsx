"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
  ChefHat,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/types/database";

type NavItem = {
  label: string;
  segment: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: MemberRole[];
  phase?: string; // set = not built yet, rendered disabled
};

const NAV: NavItem[] = [
  { label: "Dashboard", segment: "dashboard", icon: LayoutDashboard, roles: ["owner", "admin", "manager", "cashier", "kitchen"] },
  { label: "POS", segment: "pos", icon: ShoppingCart, roles: ["owner", "admin", "manager", "cashier"], phase: "Phase 3" },
  { label: "Kitchen (KOT)", segment: "kot", icon: ChefHat, roles: ["owner", "admin", "manager", "kitchen"], phase: "Phase 4" },
  { label: "Inventory", segment: "inventory", icon: Package, roles: ["owner", "admin", "manager"], phase: "Phase 5" },
  { label: "Accounting", segment: "accounting", icon: Calculator, roles: ["owner", "admin"], phase: "Phase 6" },
  { label: "Reports", segment: "reports", icon: FileSpreadsheet, roles: ["owner", "admin", "manager"], phase: "Phase 6" },
  { label: "Billing", segment: "billing", icon: CreditCard, roles: ["owner", "admin"] },
  { label: "Settings", segment: "settings", icon: Settings, roles: ["owner", "admin"] },
];

function NavLinks({ slug, role, onNavigate }: { slug: string; role: MemberRole; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {NAV.filter((item) => item.roles.includes(role)).map((item) => {
        const href = `/${slug}/${item.segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);

        if (item.phase) {
          return (
            <span
              key={item.segment}
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              title={`Coming in ${item.phase}`}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide">Soon</span>
            </span>
          );
        }

        return (
          <Link
            key={item.segment}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-accent",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOutButton() {
  return (
    <form action={signOut} className="border-t p-3">
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </form>
  );
}

export function Sidebar({ slug, tenantName, role }: { slug: string; tenantName: string; role: MemberRole }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b bg-sidebar px-4 py-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2 font-semibold">
          <UtensilsCrossed className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{tenantName}</span>
        </div>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 hover:bg-accent"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="truncate font-semibold">{tenantName}</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-md p-2 hover:bg-accent">
                <X className="size-5" />
              </button>
            </div>
            <NavLinks slug={slug} role={role} onNavigate={() => setOpen(false)} />
            <SignOutButton />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex items-center gap-2 border-b px-4 py-4 font-semibold">
          <UtensilsCrossed className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{tenantName}</span>
        </div>
        <NavLinks slug={slug} role={role} />
        <SignOutButton />
      </aside>
    </>
  );
}
