"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/orders";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/reports";

const SELECT_CLASS =
  "flex h-10 w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Date-range/status/payment-method filter bar for the sales report. Plain GET-style navigation. */
export function ReportsFilterBar({
  basePath,
  from,
  to,
  status,
  payment,
}: {
  basePath: string;
  from: string;
  to: string;
  status: string;
  payment: string;
}) {
  const router = useRouter();
  const hasFilters = status !== "" || payment !== "";

  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const params = new URLSearchParams();
    const fromVal = String(data.get("from") ?? "");
    const toVal = String(data.get("to") ?? "");
    const statusVal = String(data.get("status") ?? "");
    const paymentVal = String(data.get("payment") ?? "");
    if (fromVal) params.set("from", fromVal);
    if (toVal) params.set("to", toVal);
    if (statusVal) params.set("status", statusVal);
    if (paymentVal) params.set("payment", paymentVal);
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
        <Label htmlFor="report-from">From</Label>
        <Input id="report-from" name="from" type="date" defaultValue={from} className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-to">To</Label>
        <Input id="report-to" name="to" type="date" defaultValue={to} className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-status">Status</Label>
        <select
          id="report-status"
          name="status"
          defaultValue={status}
          onChange={(e) => submit(e.currentTarget.form!)}
          className={SELECT_CLASS}
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
        <Label htmlFor="report-payment">Payment method</Label>
        <select
          id="report-payment"
          name="payment"
          defaultValue={payment}
          onChange={(e) => submit(e.currentTarget.form!)}
          className={SELECT_CLASS}
        >
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit">Apply</Button>
      {hasFilters ? (
        <Button type="button" variant="ghost" onClick={() => router.push(`${basePath}?from=${from}&to=${to}`)}>
          Clear filters
        </Button>
      ) : null}
    </form>
  );
}
