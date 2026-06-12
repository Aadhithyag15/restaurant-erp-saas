"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addToCart,
  cartCount,
  cartTotals,
  lineSubtotal,
  removeFromCart,
  setQuantity,
  type CartLine,
} from "@/lib/cart";
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
  description: string | null;
};

function CartPanel({
  lines,
  currency,
  onSetQty,
  onRemove,
  onClear,
}: {
  lines: CartLine[];
  currency: string;
  onSetQty: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  onClear: () => void;
}) {
  const totals = cartTotals(lines);

  if (lines.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">Tap menu items to start a bill.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto lg:max-h-[50dvh]">
        {lines.map((line) => (
          <li key={line.itemId} className="flex items-center gap-2">
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
          </li>
        ))}
      </ul>

      <dl className="space-y-1 border-t pt-3 text-sm tabular-nums">
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

      <Button type="button" disabled title="Order placement arrives with the KOT phase" className="w-full">
        Place order
      </Button>
      <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onClear}>
        <Trash2 aria-hidden />
        Clear cart
      </Button>
    </div>
  );
}

export function PosScreen({
  slug,
  currency,
  categories,
  items,
}: {
  slug: string;
  currency: string;
  categories: PosCategory[];
  items: PosItem[];
}) {
  const [filter, setFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [mobileCartOpen, setMobileCartOpen] = React.useState(false);

  const query = search.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (filter === "uncategorized" && item.category_id !== null) return false;
    if (filter !== "all" && filter !== "uncategorized" && item.category_id !== filter) return false;
    if (!query) return true;
    return item.name.toLowerCase().includes(query) || (item.sku ?? "").toLowerCase().includes(query);
  });

  const hasUncategorized = items.some((i) => i.category_id === null);
  const count = cartCount(lines);
  const totals = cartTotals(lines);

  const onAdd = (item: PosItem) =>
    setLines((prev) => addToCart(prev, { itemId: item.id, name: item.name, price: item.price, taxRate: item.tax_rate }));
  const onSetQty = (itemId: string, qty: number) => setLines((prev) => setQuantity(prev, itemId, qty));
  const onRemove = (itemId: string) => setLines((prev) => removeFromCart(prev, itemId));
  const onClear = () => setLines([]);

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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or SKU…"
            aria-label="Search menu items"
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Category filter">
          {[{ id: "all", name: "All" }, ...categories, ...(hasUncategorized ? [{ id: "uncategorized", name: "Other" }] : [])].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                filter === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
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
              <button
                key={item.id}
                type="button"
                onClick={() => onAdd(item)}
                className="flex min-h-24 flex-col items-start justify-between gap-1 rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow active:scale-[0.98]"
              >
                <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{formatMoney(item.price, currency)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Desktop cart */}
      <aside className="hidden lg:block lg:w-80 lg:shrink-0">
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="size-4" aria-hidden />
              Cart {count > 0 ? `(${count})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CartPanel lines={lines} currency={currency} onSetQty={onSetQty} onRemove={onRemove} onClear={onClear} />
          </CardContent>
        </Card>
      </aside>

      {/* Mobile / tablet cart: summary bar + bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
        {mobileCartOpen ? (
          <div className="mx-auto flex max-w-xl flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-medium">
                <ShoppingCart className="size-4" aria-hidden />
                Cart {count > 0 ? `(${count})` : ""}
              </p>
              <Button type="button" size="icon" variant="ghost" aria-label="Close cart" onClick={() => setMobileCartOpen(false)}>
                <X aria-hidden />
              </Button>
            </div>
            <CartPanel lines={lines} currency={currency} onSetQty={onSetQty} onRemove={onRemove} onClear={onClear} />
          </div>
        ) : (
          <Button type="button" className="mx-auto flex w-full max-w-xl justify-between" onClick={() => setMobileCartOpen(true)}>
            <span className="flex items-center gap-2">
              <ShoppingCart aria-hidden />
              {count} item{count === 1 ? "" : "s"}
            </span>
            <span className="tabular-nums">{formatMoney(totals.total, currency)}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
