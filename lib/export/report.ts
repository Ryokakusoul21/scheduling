/** Printable and spreadsheet reports with the institution header, built from the same column list. */
import { cell, downloadText, toCsv, type Column } from "./csv";

export const SCHOOL_NAME = "GRANBY COLLEGES OF SCIENCE & TECHNOLOGY";

export interface ReportDoc<T> {
  title: string;
  /** School year and semester or term, for example "2026-2027 · First Semester". */
  term: string;
  columns: Column<T>[];
  rows: T[];
  filename: string;
  landscape?: boolean;
}

function escape(v: unknown) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function generatedOn() {
  return new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });
}

/** One class meeting in a printed timetable. */
export interface TimetableRow {
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  subject: string;
  component: string;
  section: string;
  faculty: string;
  room: string;
}

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

function clock(min: number) {
  const h = Math.floor(min / 60);
  return `${((h + 11) % 12) + 1}:${String(min % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Columns for class, teacher, and room timetables; rows are sorted by day and start time. */
export function timetableDoc(title: string, term: string, rows: TimetableRow[], filename: string): ReportDoc<TimetableRow> {
  return {
    title,
    term,
    filename,
    landscape: true,
    rows: [...rows].sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startMin - b.startMin),
    columns: [
      { header: "Day", value: (r) => r.dayOfWeek.charAt(0) + r.dayOfWeek.slice(1).toLowerCase() },
      { header: "Time", value: (r) => `${clock(r.startMin)} to ${clock(r.endMin)}` },
      { header: "Subject", value: (r) => r.subject },
      { header: "Component", value: (r) => (r.component === "LABORATORY" ? "Laboratory" : "Lecture") },
      { header: "Section", value: (r) => r.section },
      { header: "Faculty", value: (r) => r.faculty },
      { header: "Room", value: (r) => r.room },
    ],
  };
}

/** Full HTML document: header, bordered table, and a print stylesheet. */
export function reportHtml<T>(doc: ReportDoc<T>) {
  const head = doc.columns.map((c) => `<th>${escape(c.header)}</th>`).join("");
  const body = doc.rows.length
    ? doc.rows.map((r) => `<tr>${doc.columns.map((c) => `<td>${escape(c.value(r))}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${doc.columns.length}" class="empty">No records.</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.title)}</title><style>
@page { size: ${doc.landscape ? "A4 landscape" : "A4 portrait"}; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; margin: 0; }
header { text-align: center; margin-bottom: 10px; }
header .school { font-size: 13pt; font-weight: bold; letter-spacing: .3px; }
header .title { font-size: 12pt; font-weight: bold; margin-top: 4px; }
header .meta { font-size: 9pt; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #e5e5e5; font-weight: bold; }
td.empty { text-align: center; font-style: italic; }
@media print {
  thead { display: table-header-group; }
  tr, td, th { break-inside: avoid; page-break-inside: avoid; }
  th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style></head><body><header>
<div class="school">${escape(SCHOOL_NAME)}</div>
<div class="title">${escape(doc.title)}</div>
<div class="meta">School Year and Term: ${escape(doc.term)}</div>
<div class="meta">Date Generated: ${escape(generatedOn())}</div>
</header><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

/** Prints the report from a hidden frame so no page navigation or buttons appear; "Save as PDF" makes the PDF. */
export function printReport<T>(doc: ReportDoc<T>) {
  const frame = Object.assign(document.createElement("iframe"), { title: doc.title });
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(frame);
  const win = frame.contentWindow!;
  win.document.open();
  win.document.write(reportHtml(doc));
  win.document.close();
  win.addEventListener("afterprint", () => frame.remove());
  win.focus();
  win.print();
  // Fallback cleanup for browsers that do not fire afterprint inside frames.
  setTimeout(() => frame.isConnected && frame.remove(), 60_000);
}

/** Spreadsheet with the same header lines above the table; Excel opens it directly. */
export function downloadReportCsv<T>(doc: ReportDoc<T>) {
  const header = [SCHOOL_NAME, doc.title, `School Year and Term: ${doc.term}`, `Date Generated: ${generatedOn()}`, ""]
    .map(cell)
    .join("\r\n");
  downloadText(`${doc.filename}.csv`, `${header}\r\n${toCsv(doc.rows, doc.columns)}`);
}

/** One school event, holiday, or class suspension in a printed activities schedule. */
export interface ActivityRow {
  type: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
}

const ACTIVITY_TYPES: Record<string, string> = { SCHOOL_EVENT: "School event", HOLIDAY: "Holiday", CLASS_SUSPENSION: "Class suspension" };

function longDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" });
}

/** Columns for the school activities schedule, sorted by start date. */
export function activitiesDoc(title: string, term: string, rows: ActivityRow[], filename: string): ReportDoc<ActivityRow> {
  return {
    title,
    term,
    filename,
    rows: [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    columns: [
      { header: "Date", value: (r) => (r.startDate === r.endDate ? longDate(r.startDate) : `${longDate(r.startDate)} to ${longDate(r.endDate)}`) },
      { header: "Time", value: (r) => (r.startMin === null || r.endMin === null ? "Whole day" : `${clock(r.startMin)} to ${clock(r.endMin)}`) },
      { header: "Activity", value: (r) => r.title },
      { header: "Type", value: (r) => ACTIVITY_TYPES[r.type] ?? r.type },
      { header: "Description", value: (r) => r.description },
    ],
  };
}
