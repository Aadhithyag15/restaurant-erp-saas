"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/orders";

/** Search/filter bar for the orders list. Plain GET-style navigation — no client state. */
export function OrdersFilterBar({
  basePath,
  q,
  status,
  date,
}: {
  basePath: string;
  q: string;
  status: string;
  date: string;
}) {
  const router = useRouter();
  const hasFilters = q !== "" || status !== "" || date !== "";

  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const params = new URLSearchParams();
    const qVal = String(data.get("q") ?? "").trim();
    const statusVal = String(data.get("status") ?? "");
    const dateVal = String(data.get("date") ?? "");
    if (qVal) params.set("q", qVal);
    if (statusVal) params.set("status", statusVal);
    if (dateVal) params.set("date", dateVal);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-search">Order number</Label>
        <Input id="order-search" name="q" defaultValue={q} placeholder="e.g. 1024" inputMode="numeric" className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-status">Status</Label>
        <select
          id="order-status"
          name="status"
          defaultValue={status}
          onChange={(e) => submit(e.currentTarget.form!)}
          className="flex h-10 w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-date">Date</Label>
        <Input
          id="order-date"
          name="date"
          type="date"
          defaultValue={date}
          onChange={(e) => submit(e.currentTarget.form!)}
          className="w-40"
        />
      </div>
      <Button type="submit">Search</Button>
      {hasFilters ? (
        <Button type="button" variant="ghost" onClick={() => router.push(basePath)}>
          Clear filters
        </Button>
      ) : null}
    </form>
  );
}
