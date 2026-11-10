"use client";

import { toast } from "sonner";
import { CaretDown, DownloadSimple, FilePdf, FileXls, Printer } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadText, toCsv, type Column } from "@/lib/export/csv";
import { activitiesDoc, downloadReportCsv, printReport, timetableDoc, type ActivityRow, type ReportDoc, type TimetablePrintDetails, type TimetableRow } from "@/lib/export/report";

/**
 * Spreadsheet and PDF export for a table or report. PDF uses the browser's print dialog
 * ("Save as PDF") on the nearest `.print-area`, which already carries the institution header.
 */
export function ExportButtons<T>({ filename, rows, columns }: { filename: string; rows: T[]; columns: Column<T>[] }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button size="sm" variant="outline" onClick={() => downloadText(`${filename}.csv`, toCsv(rows, columns))} disabled={rows.length === 0}>
        <FileXls className="size-4" /> Spreadsheet
      </Button>
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <FilePdf className="size-4" /> PDF
      </Button>
    </div>
  );
}

/** The same spreadsheet and PDF export in one menu, for crowded toolbars. */
export function ExportMenu<T>({ filename, rows, columns }: { filename: string; rows: T[]; columns: Column<T>[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="print:hidden" />}>
        <DownloadSimple className="size-4" /> Export <CaretDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={rows.length === 0} onClick={() => downloadText(`${filename}.csv`, toCsv(rows, columns))}>
          <FileXls className="size-4" /> Spreadsheet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <FilePdf className="size-4" /> PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Institution header shown only when printing or saving as PDF. */
export function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 hidden text-center print:block">
      <p className="font-semibold">GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY</p>
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
export function TimetableReportButtons({ title, term, rows, filename, details }: { title: string; term: string; rows: TimetableRow[]; filename: string; details?: TimetablePrintDetails }) {
  return <ReportButtons doc={timetableDoc(title, term, rows, filename, details)} />;
}

/** Report buttons for school events, holidays, and class suspensions. */
export function ActivitiesReportButtons({ title, term, rows, filename, official = false, department = "All Departments" }: { title: string; term: string; rows: ActivityRow[]; filename: string; official?: boolean; department?: string }) {
  const isCollegeReport = /college/i.test(department) || (rows.length > 0 && rows.every((row) => /^(COLLEGE|COLLEGE PROGRAM)$/i.test(row.level ?? "")));
  const reportTerm = official && isCollegeReport ? withoutQuarterTerms(term) : term;
  if (official) return <ReportButtons doc={{
    title, term: reportTerm, filename, officialActivities: true, department, rows: [...rows].sort((a,b)=>a.startDate.localeCompare(b.startDate)),
    columns: [
      { header: "DATE", value: (r) => r.startDate === r.endDate ? new Date(`${r.startDate}T00:00:00Z`).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "UTC" }) : `${new Date(`${r.startDate}T00:00:00Z`).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "UTC" })} to ${new Date(`${r.endDate}T00:00:00Z`).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "UTC" })}` },
      { header: "ACTIVITIES", value: (r) => r.title },
    ],
  }} />;
  return <ReportButtons doc={activitiesDoc(title, term, rows, filename)} />;
}

function withoutQuarterTerms(term: string) {
  const separator = term.indexOf(" · ");
  if (separator < 0) return term;
  const schoolYear = term.slice(0, separator);
  const terms = term.slice(separator + 3).split(";").map((label) => label.trim()).filter((label) => !/\bquarter\b/i.test(label));
  return terms.length ? `${schoolYear} · ${terms.join("; ")}` : schoolYear;
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
