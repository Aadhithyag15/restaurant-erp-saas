"use client";

import * as React from "react";
import { useActionState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  correctStock,
  createIngredient,
  deleteIngredient,
  recordStockMovement,
  updateIngredient,
  type InventoryActionState,
} from "@/lib/actions/inventory";
import { INVENTORY_UNIT_LABELS, INVENTORY_UNITS, isLowStock, stockValue, type InventoryUnit } from "@/lib/inventory";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type IngredientRow = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  cost_per_unit: number;
};

function ErrorText({ state }: { state: InventoryActionState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

function UnitSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      id="unit"
      name="unit"
      defaultValue={defaultValue ?? INVENTORY_UNITS[0]}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {INVENTORY_UNITS.map((u) => (
        <option key={u} value={u}>
          {INVENTORY_UNIT_LABELS[u as InventoryUnit]}
        </option>
      ))}
    </select>
  );
}

function IngredientFields({ ingredient }: { ingredient?: IngredientRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={ingredient?.name} minLength={2} maxLength={80} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="unit">Unit</Label>
        <UnitSelect defaultValue={ingredient?.unit} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="minimum_stock">Minimum stock</Label>
        <Input id="minimum_stock" name="minimum_stock" type="number" inputMode="decimal" step="0.001" min="0" defaultValue={ingredient?.minimum_stock ?? 0} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="cost_per_unit">Cost per unit</Label>
        <Input id="cost_per_unit" name="cost_per_unit" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={ingredient?.cost_per_unit ?? 0} />
      </div>
    </div>
  );
}

function AddIngredientForm({ tenantId, slug }: { tenantId: string; slug: string }) {
  const action = createIngredient.bind(null, tenantId, slug);
  const [state, formAction, pending] = useActionState<InventoryActionState, FormData>(action, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state === null) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <IngredientFields />
      <ErrorText state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        <Plus aria-hidden />
        {pending ? "Adding…" : "Add ingredient"}
      </Button>
    </form>
  );
}

function EditIngredientForm({ tenantId, slug, ingredient, onDone }: { tenantId: string; slug: string; ingredient: IngredientRow; onDone: () => void }) {
  const action = updateIngredient.bind(null, tenantId, slug, ingredient.id);
  const [state, formAction, pending] = useActionState<InventoryActionState, FormData>(action, null);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (submitted && state === null) onDone();
  }, [submitted, state, onDone]);

  return (
    <form
      action={(formData) => {
        setSubmitted(true);
        formAction(formData);
      }}
      className="flex flex-col gap-3 rounded-md border bg-secondary/30 p-3"
    >
      <IngredientFields ingredient={ingredient} />
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

type MovementType = "purchase" | "waste" | "adjustment";

const MOVEMENT_LABELS: Record<MovementType, string> = {
  purchase: "Purchase (increase stock)",
  waste: "Waste (decrease stock)",
  adjustment: "Adjustment (+/-)",
};

function StockMovementForm({ tenantId, slug, ingredient, onDone }: { tenantId: string; slug: string; ingredient: IngredientRow; onDone: () => void }) {
  const [mode, setMode] = React.useState<"movement" | "correction">("movement");
  const [type, setType] = React.useState<MovementType>("purchase");

  const movementAction = recordStockMovement.bind(null, tenantId, slug, ingredient.id);
  const correctionAction = correctStock.bind(null, tenantId, slug, ingredient.id);

  const [movementState, movementFormAction, movementPending] = useActionState<InventoryActionState, FormData>(movementAction, null);
  const [correctionState, correctionFormAction, correctionPending] = useActionState<InventoryActionState, FormData>(correctionAction, null);

  const [movementSubmitted, setMovementSubmitted] = React.useState(false);
  const [correctionSubmitted, setCorrectionSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (movementSubmitted && movementState === null) onDone();
  }, [movementSubmitted, movementState, onDone]);
  React.useEffect(() => {
    if (correctionSubmitted && correctionState === null) onDone();
  }, [correctionSubmitted, correctionState, onDone]);

  const unitLabel = INVENTORY_UNIT_LABELS[ingredient.unit as InventoryUnit] ?? ingredient.unit;

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-secondary/30 p-3">
      <div className="flex gap-2" role="tablist" aria-label="Stock update type">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "movement"}
          onClick={() => setMode("movement")}
          className={cn("rounded-full border px-3 py-1 text-xs font-medium", mode === "movement" ? "border-primary bg-primary text-primary-foreground" : "bg-background")}
        >
          Record movement
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "correction"}
          onClick={() => setMode("correction")}
          className={cn("rounded-full border px-3 py-1 text-xs font-medium", mode === "correction" ? "border-primary bg-primary text-primary-foreground" : "bg-background")}
        >
          Correct stock count
        </button>
      </div>

      {mode === "movement" ? (
        <form
          action={(formData) => {
            setMovementSubmitted(true);
            movementFormAction(formData);
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="type" value={type} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`movement-type-${ingredient.id}`}>Transaction type</Label>
              <select
                id={`movement-type-${ingredient.id}`}
                value={type}
                onChange={(e) => setType(e.target.value as MovementType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((t) => (
                  <option key={t} value={t}>
                    {MOVEMENT_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`quantity-${ingredient.id}`}>Quantity ({unitLabel})</Label>
              <Input id={`quantity-${ingredient.id}`} name="quantity" type="number" inputMode="decimal" step="0.001" min="0" required />
            </div>
            {type === "purchase" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`unit-cost-${ingredient.id}`}>Unit cost (optional)</Label>
                <Input id={`unit-cost-${ingredient.id}`} name="unit_cost" type="number" inputMode="decimal" step="0.01" min="0" placeholder={String(ingredient.cost_per_unit)} />
              </div>
            ) : null}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`notes-${ingredient.id}`}>Notes (optional)</Label>
              <Input id={`notes-${ingredient.id}`} name="notes" maxLength={500} />
            </div>
          </div>
          <ErrorText state={movementState} />
          <div className="flex gap-2">
            <Button type="submit" disabled={movementPending}>
              {movementPending ? "Saving…" : "Record"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <form
          action={(formData) => {
            setCorrectionSubmitted(true);
            correctionFormAction(formData);
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`new-stock-${ingredient.id}`}>New stock level ({unitLabel})</Label>
              <Input id={`new-stock-${ingredient.id}`} name="new_stock" type="number" inputMode="decimal" step="0.001" min="0" defaultValue={ingredient.current_stock} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`correction-notes-${ingredient.id}`}>Notes (optional)</Label>
              <Input id={`correction-notes-${ingredient.id}`} name="notes" maxLength={500} placeholder="e.g. physical stock count" />
            </div>
          </div>
          <ErrorText state={correctionState} />
          <div className="flex gap-2">
            <Button type="submit" disabled={correctionPending}>
              {correctionPending ? "Saving…" : "Apply correction"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function IngredientRowItem({ tenantId, slug, currency, ingredient }: { tenantId: string; slug: string; currency: string; ingredient: IngredientRow }) {
  const [mode, setMode] = React.useState<"view" | "edit" | "stock">("view");
  const onDone = React.useCallback(() => setMode("view"), []);
  const deleteAction = deleteIngredient.bind(null, tenantId, slug, ingredient.id);
  const low = isLowStock(ingredient);
  const unitLabel = INVENTORY_UNIT_LABELS[ingredient.unit as InventoryUnit] ?? ingredient.unit;

  return (
    <li className="flex flex-col gap-2 rounded-lg px-2 py-3 transition-colors hover:bg-accent/50">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate text-sm font-medium">{ingredient.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatMoney(ingredient.cost_per_unit, currency)} / {unitLabel} · value {formatMoney(stockValue(ingredient), currency)}
          </p>
        </div>
        <div className="text-right text-sm tabular-nums">
          <p className={cn("font-medium", low ? "text-destructive" : undefined)}>
            {ingredient.current_stock} {unitLabel}
          </p>
          <p className="text-xs text-muted-foreground">min {ingredient.minimum_stock}</p>
        </div>
        {low ? <Badge variant="destructive">Low stock</Badge> : null}
        <span className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setMode((m) => (m === "stock" ? "view" : "stock"))}
            aria-label={`Update stock for ${ingredient.name}`}
            title="Record stock movement / correction"
          >
            <ClipboardList aria-hidden />
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => setMode((m) => (m === "edit" ? "view" : "edit"))} aria-label={`Edit ${ingredient.name}`}>
            <Pencil aria-hidden />
          </Button>
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!window.confirm(`Delete "${ingredient.name}"? This cannot be undone and removes it from any recipes.`)) e.preventDefault();
            }}
          >
            <Button type="submit" size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete ${ingredient.name}`}>
              <Trash2 aria-hidden />
            </Button>
          </form>
        </span>
      </div>
      <AnimatePresence initial={false}>
        {mode === "edit" ? (
          <motion.div
            key="edit"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <EditIngredientForm tenantId={tenantId} slug={slug} ingredient={ingredient} onDone={onDone} />
          </motion.div>
        ) : null}
        {mode === "stock" ? (
          <motion.div
            key="stock"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <StockMovementForm tenantId={tenantId} slug={slug} ingredient={ingredient} onDone={onDone} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

export function IngredientManager({ tenantId, slug, currency, ingredients }: { tenantId: string; slug: string; currency: string; ingredients: IngredientRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingredients</CardTitle>
        <CardDescription>
          Stock is only changed by recording a transaction below — new ingredients start at 0 until you record a purchase or correction.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <AddIngredientForm tenantId={tenantId} slug={slug} />
        {ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ingredients yet — add your first one above.</p>
        ) : (
          <ul className="flex flex-col">
            {ingredients.map((ingredient, i) => (
              <React.Fragment key={ingredient.id}>
                {i > 0 ? <Separator /> : null}
                <IngredientRowItem tenantId={tenantId} slug={slug} currency={currency} ingredient={ingredient} />
              </React.Fragment>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
