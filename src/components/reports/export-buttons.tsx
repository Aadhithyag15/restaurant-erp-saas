"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/orders";
import { SALES_REPORT_CSV_HEADER, salesReportToCsv, type SalesReportRow } from "@/lib/reports";

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Client-side CSV/Excel/PDF export of the sales report rows already loaded on the page. */
export function ExportButtons({ rows, filenameBase }: { rows: SalesReportRow[]; filenameBase: string }) {
  const disabled = rows.length === 0;

  const handleCsv = () => {
    downloadBlob(salesReportToCsv(rows), `${filenameBase}.csv`, "text/csv;charset=utf-8;");
  };

  const handleExcel = async () => {
    const XLSX = await import("xlsx");
    const data = rows.map((r) => ({
      "Order #": r.orderNumber,
      Date: r.date,
      Status: ORDER_STATUS_LABELS[r.status],
      "Payment method": PAYMENT_METHOD_LABELS[r.paymentMethod],
      Customer: r.customer,
      Subtotal: r.subtotal,
      Tax: r.tax,
      Total: r.total,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales report");
    XLSX.writeFile(workbook, `${filenameBase}.xlsx`);
  };

  const handlePdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Sales report", 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [SALES_REPORT_CSV_HEADER],
      body: rows.map((r) => [
        String(r.orderNumber),
        r.date,
        ORDER_STATUS_LABELS[r.status],
        PAYMENT_METHOD_LABELS[r.paymentMethod],
        r.customer,
        r.subtotal.toFixed(2),
        r.tax.toFixed(2),
        r.total.toFixed(2),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [33, 33, 33] },
    });
    doc.save(`${filenameBase}.pdf`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleCsv} disabled={disabled}>
        <Download aria-hidden /> CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={handleExcel} disabled={disabled}>
        <FileSpreadsheet aria-hidden /> Excel
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={handlePdf} disabled={disabled}>
        <FileText aria-hidden /> PDF
      </Button>
    </div>
  );
}
