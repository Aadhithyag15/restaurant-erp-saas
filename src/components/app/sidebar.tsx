"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, UtensilsCrossed, X } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { navForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/app/theme-toggle";
import type { MemberRole } from "@/types/database";

function NavLinks({ slug, role, onNavigate }: { slug: string; role: MemberRole; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {navForRole(role).map((item) => {
        const href = `/${slug}/${item.segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);

        if (item.phase) {
          return (
            <span
              key={item.segment}
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/60"
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
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground",
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
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </form>
  );
}

function Brand({ tenantName }: { tenantName: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 font-semibold">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <UtensilsCrossed className="size-4" aria-hidden />
      </span>
      <span className="truncate">{tenantName}</span>
    </div>
  );
}

export function Sidebar({ slug, tenantName, role }: { slug: string; tenantName: string; role: MemberRole }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b bg-sidebar px-4 py-3 print:hidden md:hidden">
        <Brand tenantName={tenantName} />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-2 transition-colors hover:bg-accent"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            role="dialog"
            aria-modal="true"
            initial="closed"
            animate="open"
            exit="closed"
          >
            <motion.div
              className="absolute inset-0 bg-foreground/30"
              variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar shadow-lg"
              variants={{ open: { x: 0 }, closed: { x: "-100%" } }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between border-b px-4 py-4">
                <Brand tenantName={tenantName} />
                <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-md p-2 transition-colors hover:bg-accent">
                  <X className="size-5" />
                </button>
              </div>
              <NavLinks slug={slug} role={role} onNavigate={() => setOpen(false)} />
              <SignOutButton />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar print:hidden md:flex">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-4">
          <Brand tenantName={tenantName} />
          <ThemeToggle />
        </div>
        <NavLinks slug={slug} role={role} />
        <SignOutButton />
      </aside>
    </>
  );
}
