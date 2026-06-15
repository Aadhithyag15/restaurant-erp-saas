"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createCategory, deleteCategory, renameCategory, type MenuActionState } from "@/lib/actions/menu";

export type Category = { id: string; name: string; sort_order: number; is_active: boolean };

function ErrorText({ state }: { state: MenuActionState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  );
}

function AddCategoryForm({ tenantId, slug }: { tenantId: string; slug: string }) {
  const action = createCategory.bind(null, tenantId, slug);
  const [state, formAction, pending] = useActionState<MenuActionState, FormData>(action, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state === null) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input name="name" placeholder="e.g. Starters" aria-label="New category name" minLength={2} maxLength={40} required />
        <Button type="submit" disabled={pending}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>
      <ErrorText state={state} />
    </form>
  );
}

function CategoryRow({ tenantId, slug, category }: { tenantId: string; slug: string; category: Category }) {
  const [editing, setEditing] = React.useState(false);
  const renameAction = renameCategory.bind(null, tenantId, slug, category.id);
  const [state, formAction, pending] = useActionState<MenuActionState, FormData>(renameAction, null);
  const deleteAction = deleteCategory.bind(null, tenantId, slug, category.id);

  React.useEffect(() => {
    if (state === null) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <li className="flex flex-col gap-1 py-2">
        <form action={formAction} className="flex items-center gap-2">
          <Input name="name" defaultValue={category.name} aria-label={`Rename ${category.name}`} minLength={2} maxLength={40} required autoFocus />
          <Button type="submit" size="icon" variant="default" disabled={pending} aria-label="Save name">
            <Check aria-hidden />
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel rename">
            <X aria-hidden />
          </Button>
        </form>
        <ErrorText state={state} />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
      <span className="min-w-0 truncate text-sm font-medium">{category.name}</span>
      <span className="flex shrink-0 items-center gap-1">
        <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label={`Rename ${category.name}`}>
          <Pencil aria-hidden />
        </Button>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!window.confirm(`Delete "${category.name}"? Items in it are kept and become uncategorized.`)) {
              e.preventDefault();
            }
          }}
        >
          <Button type="submit" size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete ${category.name}`}>
            <Trash2 aria-hidden />
          </Button>
        </form>
      </span>
    </li>
  );
}

export function CategoryManager({ tenantId, slug, categories }: { tenantId: string; slug: string; categories: Category[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>Group your menu — categories become the filter chips on the POS.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AddCategoryForm tenantId={tenantId} slug={slug} />
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories yet — add your first one above.</p>
        ) : (
          <ul className="divide-y">
            {categories.map((c) => (
              <CategoryRow key={c.id} tenantId={tenantId} slug={slug} category={c} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
