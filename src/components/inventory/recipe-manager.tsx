"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRecipeLine, deleteRecipeLine, updateRecipeLine, type InventoryActionState } from "@/lib/actions/inventory";
import { INVENTORY_UNIT_LABELS, type InventoryUnit } from "@/lib/inventory";

export type RecipeMenuItem = { id: string; name: string };
export type RecipeIngredient = { id: string; name: string; unit: string };
export type RecipeLine = { id: string; menu_item_id: string; ingredient_id: string; quantity: number };

function ErrorText({ state }: { state: InventoryActionState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

function AddRecipeLineForm({ tenantId, slug, menuItemId, availableIngredients }: { tenantId: string; slug: string; menuItemId: string; availableIngredients: RecipeIngredient[] }) {
  const action = createRecipeLine.bind(null, tenantId, slug, menuItemId);
  const [state, formAction, pending] = useActionState<InventoryActionState, FormData>(action, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state === null) formRef.current?.reset();
  }, [state]);

  if (availableIngredients.length === 0) {
    return <p className="text-sm text-muted-foreground">Every ingredient is already in this recipe.</p>;
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="grid min-w-48 flex-1 gap-1.5">
        <Label htmlFor="ingredient_id">Ingredient</Label>
        <select
          id="ingredient_id"
          name="ingredient_id"
          required
          defaultValue=""
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Choose ingredient…
          </option>
          {availableIngredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({INVENTORY_UNIT_LABELS[i.unit as InventoryUnit] ?? i.unit})
            </option>
          ))}
        </select>
      </div>
      <div className="grid w-32 gap-1.5">
        <Label htmlFor="quantity">Quantity</Label>
        <Input id="quantity" name="quantity" type="number" inputMode="decimal" step="0.001" min="0" required />
      </div>
      <Button type="submit" disabled={pending}>
        <Plus aria-hidden />
        {pending ? "Adding…" : "Add"}
      </Button>
      <ErrorText state={state} />
    </form>
  );
}

function RecipeLineRow({ tenantId, slug, line, ingredient }: { tenantId: string; slug: string; line: RecipeLine; ingredient: RecipeIngredient | undefined }) {
  const action = updateRecipeLine.bind(null, tenantId, slug, line.id);
  const [state, formAction, pending] = useActionState<InventoryActionState, FormData>(action, null);
  const deleteAction = deleteRecipeLine.bind(null, tenantId, slug, line.id);
  const unitLabel = ingredient ? (INVENTORY_UNIT_LABELS[ingredient.unit as InventoryUnit] ?? ingredient.unit) : "";

  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{ingredient?.name ?? "Unknown ingredient"}</span>
      <form action={formAction} className="flex items-center gap-2">
        <Input name="quantity" type="number" inputMode="decimal" step="0.001" min="0" defaultValue={line.quantity} className="h-8 w-24" aria-label={`Quantity of ${ingredient?.name ?? "ingredient"}`} />
        <span className="text-xs text-muted-foreground">{unitLabel}</span>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Update"}
        </Button>
      </form>
      <ErrorText state={state} />
      <form action={deleteAction}>
        <Button type="submit" size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Remove ${ingredient?.name ?? "ingredient"} from recipe`}>
          <Trash2 aria-hidden />
        </Button>
      </form>
    </li>
  );
}

export function RecipeManager({
  tenantId,
  slug,
  menuItems,
  ingredients,
  recipeLines,
}: {
  tenantId: string;
  slug: string;
  menuItems: RecipeMenuItem[];
  ingredients: RecipeIngredient[];
  recipeLines: RecipeLine[];
}) {
  const [menuItemId, setMenuItemId] = React.useState<string>(menuItems[0]?.id ?? "");

  const linesForItem = recipeLines.filter((l) => l.menu_item_id === menuItemId);
  const usedIngredientIds = new Set(linesForItem.map((l) => l.ingredient_id));
  const availableIngredients = ingredients.filter((i) => !usedIngredientIds.has(i.id));
  const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipes (BOM)</CardTitle>
        <CardDescription>Assign ingredients and quantities to menu items. Placing an order on the POS depletes these automatically.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {menuItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add menu items first, then come back here to define their recipes.</p>
        ) : ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add ingredients above before building recipes.</p>
        ) : (
          <>
            <div className="grid max-w-sm gap-1.5">
              <Label htmlFor="recipe-menu-item">Menu item</Label>
              <select
                id="recipe-menu-item"
                value={menuItemId}
                onChange={(e) => setMenuItemId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {menuItemId ? (
              <>
                {linesForItem.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ingredients assigned yet.</p>
                ) : (
                  <ul className="divide-y">
                    {linesForItem.map((line) => (
                      <RecipeLineRow key={line.id} tenantId={tenantId} slug={slug} line={line} ingredient={ingredientsById.get(line.ingredient_id)} />
                    ))}
                  </ul>
                )}
                <AddRecipeLineForm tenantId={tenantId} slug={slug} menuItemId={menuItemId} availableIngredients={availableIngredients} />
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
