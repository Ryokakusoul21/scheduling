"use client";

import { toast } from "sonner";
import { FilePdf, FileXls, Printer } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { downloadText, toCsv, type Column } from "@/lib/export/csv";
import { activitiesDoc, downloadReportCsv, printReport, timetableDoc, type ActivityRow, type ReportDoc, type TimetableRow } from "@/lib/export/report";

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

/** Print, PDF, and spreadsheet buttons for a report document (clean bordered table with the institution header). */
export function ReportButtons<T>({ doc }: { doc: ReportDoc<T> }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button size="sm" variant="outline" onClick={() => printReport(doc)}>
        <Printer className="size-4" /> Print
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          toast.info('Choose "Save as PDF" as the printer.');
          printReport(doc);
        }}
      >
        <FilePdf className="size-4" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => downloadReportCsv(doc)} disabled={doc.rows.length === 0}>
        <FileXls className="size-4" /> Spreadsheet
      </Button>
    </div>
  );
}

/** Report buttons for a timetable whose rows come from a server component. */
export function TimetableReportButtons({ title, term, rows, filename }: { title: string; term: string; rows: TimetableRow[]; filename: string }) {
  return <ReportButtons doc={timetableDoc(title, term, rows, filename)} />;
}

/** Report buttons for school events, holidays, and class suspensions. */
export function ActivitiesReportButtons({ title, term, rows, filename }: { title: string; term: string; rows: ActivityRow[]; filename: string }) {
  return <ReportButtons doc={activitiesDoc(title, term, rows, filename)} />;
}

/** One room a student's section uses, for the printed room assignments list. */
export interface RoomAssignmentRow {
  room: string;
  location: string;
  type: string;
  subjects: string;
}

/** Report buttons for a section's room assignments. */
export function RoomAssignmentsReportButtons({ title, term, rows, filename }: { title: string; term: string; rows: RoomAssignmentRow[]; filename: string }) {
  return (
    <ReportButtons
      doc={{
        title,
        term,
        rows,
        filename,
        columns: [
          { header: "Room", value: (r) => r.room },
          { header: "Building and Floor", value: (r) => r.location },
          { header: "Type", value: (r) => r.type },
          { header: "Subjects Held Here", value: (r) => r.subjects },
        ],
      }}
    />
  );
}
