"use client";

import { FilePdf, FileXls } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { downloadText, toCsv, type Column } from "@/lib/export/csv";

/**
 * Spreadsheet and PDF export for a table or report. PDF uses the browser's print dialog
 * ("Save as PDF") on the nearest `.print-area`, which already carries the institution header.
 */
export function ExportButtons<T>({ filename, rows, columns }: { filename: string; rows: T[]; columns: Column<T>[] }) {
  return (
    <div className="flex gap-2 print:hidden">
      <Button size="sm" variant="outline" onClick={() => downloadText(`${filename}.csv`, toCsv(rows, columns))} disabled={rows.length === 0}>
        <FileXls className="size-4" /> Spreadsheet
      </Button>
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <FilePdf className="size-4" /> PDF
      </Button>
    </div>
  );
}

/** Institution header shown only when printing or saving as PDF. */
export function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 hidden text-center print:block">
      <p className="font-semibold">GRANBY COLLEGES OF SCIENCE &amp; TECHNOLOGY</p>
      <p className="text-sm">{title}</p>
      {subtitle && <p className="text-xs">{subtitle}</p>}
    </div>
  );
}
