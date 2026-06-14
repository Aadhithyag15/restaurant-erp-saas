"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReceiptButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
