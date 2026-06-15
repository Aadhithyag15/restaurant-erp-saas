"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { VegMark } from "@/components/menu/veg-mark";
import { placeOrder } from "@/lib/actions/orders";
import {
  addToCart,
  cartCount,
  cartTotals,
  lineSubtotal,
  removeFromCart,
  setQuantity,
  toOrderPayload,
  type CartItem,
  type CartLine,
} from "@/lib/cart";
import { cartStorageKey, deserializeCart, serializeCart } from "@/lib/cart-storage";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PosCategory = { id: string; name: string };
export type PosItem = {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  price: number;
  tax_rate: number;
  is_veg: boolean;
  description: string | null;
};

const AVATAR_TONES = [
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-accent text-accent-foreground",
];

/** Deterministic tone for an item's avatar, grouped by category. */
function avatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

/** "Chicken Biryani" -> "CB" */
function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

function FoodCard({ item, currency, justAdded, onAdd }: { item: PosItem; currency: string; justAdded: boolean; onAdd: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onAdd}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex min-h-28 flex-col items-start justify-between gap-2 rounded-xl border bg-card p-3 text-left shadow-[var(--shadow-sm)] transition-all hover:border-primary/40 hover:shadow-[var(--shadow-md)]",
        justAdded && "border-primary ring-2 ring-primary/30",
      )}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", avatarTone(item.category_id ?? item.id))}>
          {initials(item.name)}
        </span>
        <VegMark isVeg={item.is_veg} className="mt-1" />
      </span>
      <span className="w-full">
        <span className="line-clamp-2 block text-sm font-medium">{item.name}</span>
        <span className="mt-1 block text-sm font-semibold tabular-nums text-primary">{formatMoney(item.price, currency)}</span>
      </span>
    </motion.button>
  );
}

function CartCount({ count }: { count: number }) {
  return (
    <motion.span key={count} initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} className="tabular-nums">
      {count}
    </motion.span>
  );
}

function CartPanel({
  lines,
  currency,
  lastOrder,
  placing,
  orderError,
  onSetQty,
  onRemove,
  onClear,
  onPlaceOrder,
  onDismissSuccess,
}: {
  lines: CartLine[];
  currency: string;
  lastOrder: { orderNumber: number } | null;
  placing: boolean;
  orderError: string | null;
  onSetQty: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  onClear: () => void;
  onPlaceOrder: () => void;
  onDismissSuccess: () => void;
}) {
  const totals = cartTotals(lines);

  if (lines.length === 0) {
    if (lastOrder) {
      return (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 px-1 py-6 text-center">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <div>
            <p className="text-base font-semibold">Order #{lastOrder.orderNumber} placed</p>
            <p className="text-sm text-muted-foreground">Sent to the kitchen.</p>
          </div>
          <Button type="button" variant="outline" onClick={onDismissSuccess}>
            New order
          </Button>
        </motion.div>
      );
    }
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">Tap menu items to start a bill.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto lg:max-h-[50dvh]">
        <AnimatePresence initial={false}>
          {lines.map((line) => (
            <motion.li
              key={line.itemId}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{line.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney(line.price, currency)} × {line.qty} = {formatMoney(lineSubtotal(line), currency)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" size="icon" variant="outline" className="size-8" aria-label={`Decrease ${line.name}`} onClick={() => onSetQty(line.itemId, line.qty - 1)}>
                  <Minus aria-hidden />
                </Button>
                <span className="w-7 text-center text-sm tabular-nums">{line.qty}</span>
                <Button type="button" size="icon" variant="outline" className="size-8" aria-label={`Increase ${line.name}`} onClick={() => onSetQty(line.itemId, line.qty + 1)}>
                  <Plus aria-hidden />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive" aria-label={`Remove ${line.name}`} onClick={() => onRemove(line.itemId)}>
                  <X aria-hidden />
                </Button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <Separator />

      <dl className="space-y-1 text-sm tabular-nums">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd>{formatMoney(totals.subtotal, currency)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Tax</dt>
          <dd>{formatMoney(totals.tax, currency)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatMoney(totals.total, currency)}</dd>
        </div>
      </dl>

      {orderError ? (
        <p role="alert" className="text-sm text-destructive">
          {orderError}
        </p>
      ) : null}

      <Button type="button" className="w-full" disabled={placing} onClick={onPlaceOrder}>
        {placing ? "Placing order…" : "Place order"}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" disabled={placing} onClick={onClear}>
        <Trash2 aria-hidden />
        Clear cart
      </Button>
    </div>
  );
}

export function PosScreen({
  slug,
  tenantId,
  currency,
  categories,
  items,
}: {
  slug: string;
  tenantId: string;
  currency: string;
  categories: PosCategory[];
  items: PosItem[];
}) {
  const [filter, setFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [mobileCartOpen, setMobileCartOpen] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [placing, setPlacing] = React.useState(false);
  const [orderError, setOrderError] = React.useState<string | null>(null);
  const [lastOrder, setLastOrder] = React.useState<{ orderNumber: number } | null>(null);
  const [justAddedId, setJustAddedId] = React.useState<string | null>(null);

  const searchRef = React.useRef<HTMLInputElement>(null);

  // --- Cart persistence (M5) -----------------------------------------------
  // Restore after mount (SSR-safe), re-anchored to the live menu so stale
  // prices or deleted items can never resurface from the cache.
  const itemsById = React.useMemo(() => {
    const map = new Map<string, CartItem>();
    for (const i of items) map.set(i.id, { itemId: i.id, name: i.name, price: i.price, taxRate: i.tax_rate });
    return map;
  }, [items]);

  React.useEffect(() => {
    try {
      setLines(deserializeCart(window.localStorage.getItem(cartStorageKey(slug)), itemsById));
    } catch {
      // storage unavailable (private mode etc.) — start with an empty cart
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per tenant
  }, [slug]);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      const key = cartStorageKey(slug);
      if (lines.length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, serializeCart(lines));
    } catch {
      // best-effort persistence; the in-memory cart still works
    }
  }, [lines, hydrated, slug]);
  // --------------------------------------------------------------------------

  // Clear the "just added" highlight shortly after it's set.
  React.useEffect(() => {
    if (!justAddedId) return;
    const timer = setTimeout(() => setJustAddedId(null), 350);
    return () => clearTimeout(timer);
  }, [justAddedId]);

  const query = search.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (filter === "uncategorized" && item.category_id !== null) return false;
    if (filter !== "all" && filter !== "uncategorized" && item.category_id !== filter) return false;
    if (!query) return true;
    return item.name.toLowerCase().includes(query) || (item.sku ?? "").toLowerCase().includes(query);
  });

  const hasUncategorized = items.some((i) => i.category_id === null);
  const categoryTabs = React.useMemo(
    () => [{ id: "all", name: "All" }, ...categories, ...(hasUncategorized ? [{ id: "uncategorized", name: "Other" }] : [])],
    [categories, hasUncategorized],
  );
  const count = cartCount(lines);
  const totals = cartTotals(lines);

  const onAdd = (item: PosItem) => {
    setLastOrder(null);
    setOrderError(null);
    setJustAddedId(item.id);
    setLines((prev) => addToCart(prev, { itemId: item.id, name: item.name, price: item.price, taxRate: item.tax_rate }));
  };
  const onSetQty = (itemId: string, qty: number) => setLines((prev) => setQuantity(prev, itemId, qty));
  const onRemove = (itemId: string) => setLines((prev) => removeFromCart(prev, itemId));
  const onClear = () => {
    setOrderError(null);
    setLines([]);
  };
  const onDismissSuccess = () => setLastOrder(null);

  const onPlaceOrder = React.useCallback(async () => {
    setOrderError(null);
    setPlacing(true);
    try {
      const result = await placeOrder(tenantId, toOrderPayload(lines));
      if (!result.ok) {
        setOrderError(result.error);
        return;
      }
      setLines([]);
      setLastOrder({ orderNumber: result.orderNumber });
    } finally {
      setPlacing(false);
    }
  }, [tenantId, lines]);

  // --- Keyboard shortcuts ----------------------------------------------------
  // "/" focuses search, Esc clears search or closes the mobile cart, 1-9
  // switch category tabs, Ctrl/Cmd+Enter places the order. Ignored while
  // typing, except "/" (which only matters when not already focused) and
  // Esc (always handled).
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (lines.length > 0 && !placing) {
          e.preventDefault();
          void onPlaceOrder();
        }
        return;
      }

      if (e.key === "Escape") {
        if (search) {
          setSearch("");
          return;
        }
        if (mobileCartOpen) setMobileCartOpen(false);
        return;
      }

      if (isTyping) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        const tab = categoryTabs[Number(e.key) - 1];
        if (tab) setFilter(tab.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [categoryTabs, lines, mobileCartOpen, onPlaceOrder, placing, search]);
  // ----------------------------------------------------------------------------

  if (items.length === 0) {
    return (
      <Card className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-secondary">
            <BookOpen className="size-5" aria-hidden />
          </div>
          <CardTitle>No menu yet</CardTitle>
          <CardDescription>
            Add categories and items in the{" "}
            <Link href={`/${slug}/menu`} className="underline underline-offset-4">
              Menu manager
            </Link>{" "}
            — they appear here instantly.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex min-h-[70dvh] flex-col gap-4 lg:flex-row">
      {/* Menu panel */}
      <section className="flex min-w-0 flex-1 flex-col gap-3 pb-20 lg:pb-0">
        <h1 className="sr-only">POS</h1>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items or SKU…"
              aria-label="Search menu items"
              className="pl-9"
            />
          </div>
          <div className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">/</kbd> search
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">1-9</kbd> categories
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl/⌘+Enter</kbd> place order
            </span>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Category filter">
          {categoryTabs.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                filter === c.id ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background hover:bg-accent",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No items match.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => (
              <FoodCard key={item.id} item={item} currency={currency} justAdded={justAddedId === item.id} onAdd={() => onAdd(item)} />
            ))}
          </div>
        )}
      </section>

      {/* Desktop cart */}
      <aside className="hidden lg:block lg:w-80 lg:shrink-0">
        <Card className="shadow-[var(--shadow-lg)] lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="size-4" aria-hidden />
              Cart {count > 0 ? <>(<CartCount count={count} />)</> : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CartPanel
              lines={lines}
              currency={currency}
              lastOrder={lastOrder}
              placing={placing}
              orderError={orderError}
              onSetQty={onSetQty}
              onRemove={onRemove}
              onClear={onClear}
              onPlaceOrder={onPlaceOrder}
              onDismissSuccess={onDismissSuccess}
            />
          </CardContent>
        </Card>
      </aside>

      {/* Mobile / tablet cart: summary bar + slide-up sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
        <Button type="button" className="mx-auto flex w-full max-w-xl justify-between" onClick={() => setMobileCartOpen(true)}>
          <span className="flex items-center gap-2">
            <ShoppingCart aria-hidden />
            <CartCount count={count} /> item{count === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums">{formatMoney(totals.total, currency)}</span>
        </Button>
      </div>

      <AnimatePresence>
        {mobileCartOpen ? (
          <React.Fragment>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileCartOpen(false)}
              aria-hidden
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-label="Cart"
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border bg-background p-4 shadow-[var(--shadow-lg)] lg:hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted" />
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 font-medium">
                  <ShoppingCart className="size-4" aria-hidden />
                  Cart {count > 0 ? <>(<CartCount count={count} />)</> : ""}
                </p>
                <Button type="button" size="icon" variant="ghost" aria-label="Close cart" onClick={() => setMobileCartOpen(false)}>
                  <X aria-hidden />
                </Button>
              </div>
              <CartPanel
                lines={lines}
                currency={currency}
                lastOrder={lastOrder}
                placing={placing}
                orderError={orderError}
                onSetQty={onSetQty}
                onRemove={onRemove}
                onClear={onClear}
                onPlaceOrder={onPlaceOrder}
                onDismissSuccess={onDismissSuccess}
              />
            </motion.div>
          </React.Fragment>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
