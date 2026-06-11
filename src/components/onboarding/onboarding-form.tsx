"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTenant, type ActionState } from "@/lib/actions/tenant";
import { slugify } from "@/lib/slug";

const CURRENCIES = [
  { code: "INR", label: "₹ Indian Rupee (INR)" },
  { code: "USD", label: "$ US Dollar (USD)" },
  { code: "EUR", label: "€ Euro (EUR)" },
  { code: "GBP", label: "£ British Pound (GBP)" },
  { code: "AED", label: "AED UAE Dirham" },
  { code: "SGD", label: "S$ Singapore Dollar (SGD)" },
  { code: "AUD", label: "A$ Australian Dollar (AUD)" },
  { code: "CAD", label: "C$ Canadian Dollar (CAD)" },
];

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createTenant, null);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="name">Restaurant name</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Chicken Story"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="slug">Web address</Label>
        <Input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          placeholder="chicken-story"
          required
        />
        <p className="text-xs text-muted-foreground">
          Your team signs in at <span className="font-mono">/{slug || "your-restaurant"}</span>. Lowercase
          letters, numbers and hyphens.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="currency">Currency</Label>
        <select
          id="currency"
          name="currency"
          defaultValue="INR"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating your restaurant…" : "Create restaurant & start trial"}
      </Button>
    </form>
  );
}
