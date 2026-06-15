"use client";

import * as React from "react";
import { useActionState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VegMark } from "@/components/menu/veg-mark";
import { createItem, deleteItem, setItemAvailability, updateItem, type MenuActionState } from "@/lib/actions/menu";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  price: number;
  tax_rate: number;
  is_veg: boolean;
  is_available: boolean;
  description: string | null;
};
export type CategoryOption = { id: string; name: string };

function ErrorText({ state }: { state: MenuActionState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

function ItemFields({ categories, item }: { categories: CategoryOption[]; item?: MenuItem }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={item?.name} minLength={2} maxLength={80} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="category_id">Category</Label>
        <select
          id="category_id"
          name="category_id"
          defaultValue={item?.category_id ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sku">SKU (optional)</Label>
        <Input id="sku" name="sku" defaultValue={item?.sku ?? ""} maxLength={40} placeholder="e.g. BIR-01" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="price">Price</Label>
        <Input id="price" name="price" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={item?.price} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tax_rate">Tax %</Label>
        <Input id="tax_rate" name="tax_rate" type="number" inputMode="decimal" step="0.01" min="0" max="100" defaultValue={item?.tax_rate ?? 0} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="description">Description (optional)</Label>
        <textarea
          id="description"
          name="description"
          defaultValue={item?.description ?? ""}
          maxLength={500}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_veg" defaultChecked={item?.is_veg ?? false} className="size-4 accent-primary" />
          Vegetarian
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_available" defaultChecked={item ? item.is_available : true} className="size-4 accent-primary" />
          Available on POS
        </label>
      </div>
    </div>
  );
}

function AddItemForm({ tenantId, slug, categories }: { tenantId: string; slug: string; categories: CategoryOption[] }) {
  const action = createItem.bind(null, tenantId, slug);
  const [state, formAction, pending] = useActionState<MenuActionState, FormData>(action, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state === null) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <ItemFields categories={categories} />
      <ErrorText state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        <Plus aria-hidden />
        {pending ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}

function EditItemForm({
  tenantId,
  slug,
  categories,
  item,
  onDone,
}: {
  tenantId: string;
  slug: string;
  categories: CategoryOption[];
  item: MenuItem;
  onDone: () => void;
}) {
  const action = updateItem.bind(null, tenantId, slug, item.id);
  const [state, formAction, pending] =
    useActionState<MenuActionState, FormData>(action, null);

  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (submitted && state === null) {
      onDone();
  }
  }, [submitted, state, onDone]);
  return (
    <form
      action={(formData) => {
        setSubmitted(true);
       formAction(formData);
      }}
      className="flex flex-col gap-3 rounded-md border bg-secondary/30 p-3"
    >
      <ItemFields categories={categories} item={item} />
      <ErrorText state={state} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ItemRow({
  tenantId,
  slug,
  currency,
  categories,
  item,
}: {
  tenantId: string;
  slug: string;
  currency: string;
  categories: CategoryOption[];
  item: MenuItem;
}) {
  const [editing, setEditing] = React.useState(false);
  const onDone = React.useCallback(() => setEditing(false), []);
  const toggleAction = setItemAvailability.bind(null, tenantId, slug, item.id, !item.is_available);
  const deleteAction = deleteItem.bind(null, tenantId, slug, item.id);
  const categoryName = categories.find((c) => c.id === item.category_id)?.name ?? "Uncategorized";

  if (editing) {
    return (
      <li className="py-3">
        <EditItemForm tenantId={tenantId} slug={slug} categories={categories} item={item} onDone={onDone} />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-3 transition-colors hover:bg-accent/50">
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-2 text-sm font-medium">
          <VegMark isVeg={item.is_veg} />
          <span className="truncate">{item.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {categoryName}
          {item.sku ? ` · ${item.sku}` : ""}
        </p>
      </div>
      <div className="text-right text-sm tabular-nums">
        <p className="font-medium">{formatMoney(item.price, currency)}</p>
        <p className="text-xs text-muted-foreground">{item.tax_rate}% tax</p>
      </div>
      <form action={toggleAction}>
        <button
          type="submit"
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
            item.is_available ? "border-success/40 bg-success/10 text-success" : "bg-secondary text-muted-foreground",
          )}
          title={item.is_available ? "Click to hide from POS" : "Click to show on POS"}
        >
          {item.is_available ? "Available" : "Hidden"}
        </button>
      </form>
      <span className="flex shrink-0 items-center gap-1">
        <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${item.name}`}>
          <Pencil aria-hidden />
        </Button>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!window.confirm(`Delete "${item.name}"? This cannot be undone (the change is audited).`)) e.preventDefault();
          }}
        >
          <Button type="submit" size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete ${item.name}`}>
            <Trash2 aria-hidden />
          </Button>
        </form>
      </span>
    </li>
  );
}

export function ItemManager({
  tenantId,
  slug,
  currency,
  categories,
  items,
}: {
  tenantId: string;
  slug: string;
  currency: string;
  categories: CategoryOption[];
  items: MenuItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Items</CardTitle>
        <CardDescription>Everything sellable on the POS — price and tax here are the source of truth.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <AddItemForm tenantId={tenantId} slug={slug} categories={categories} />
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items yet — add your first dish above.</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <ItemRow key={item.id} tenantId={tenantId} slug={slug} currency={currency} categories={categories} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
