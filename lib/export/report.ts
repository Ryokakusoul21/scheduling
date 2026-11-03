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
  /** Optional official-document department heading and preparer signature. */
  department?: string;
  preparedBy?: string;
  designation?: string;
  /** Formal GRANBY COLLEGES OF SCIENCE & TECHNOLOGY two-column school-activities document. */
  officialActivities?: boolean;
  /** Further tables printed below the main one, each under its own heading. */
  extra?: ReportSection[];
}

export interface ReportSection {
  heading: string;
  columns: Column<never>[];
  rows: unknown[];
}

/** Typed helper so callers keep column and row types together. */
export function reportSection<T>(heading: string, columns: Column<T>[], rows: T[]): ReportSection {
  return { heading, columns: columns as Column<never>[], rows };
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
function tableHtml<T>(columns: Column<T>[], rows: T[]) {
  const head = columns.map((c) => `<th>${escape(c.header)}</th>`).join("");
  const body = rows.length
    ? rows.map((r) => `<tr>${columns.map((c) => `<td>${escape(c.value(r))}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}" class="empty">No records.</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function reportHtml<T>(doc: ReportDoc<T>) {
  if (doc.officialActivities) {
    const [schoolYear, semester] = doc.term.split(" · ");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.title)}</title><style>
@page{size:letter portrait;margin:12mm}*{box-sizing:border-box}body{font-family:"Times New Roman",serif;color:#000;margin:0;font-size:11pt}.letterhead{display:grid;grid-template-columns:80px 1fr 80px;align-items:center;border-bottom:2px solid #000;padding-bottom:8px}.seal{width:70px;height:70px;object-fit:contain}.right{text-align:right}.center{text-align:center}.school{font-weight:700;font-size:14pt}.department{font-weight:700;font-size:16pt;margin-top:2px}.small{font-size:9.5pt}.document-title{text-align:center;font-weight:700;margin:20px 0 14px;line-height:1.55}.document-title div{text-transform:uppercase}table{width:100%;border-collapse:collapse}th,td{border:1.5px solid #000;padding:6px 8px;vertical-align:top}th{text-align:center;font-weight:700}th:first-child,td:first-child{width:38%}th:last-child,td:last-child{width:62%}.signature{margin-top:44px;width:310px}.signature .name{margin-top:34px;border-bottom:1px solid #000;text-align:center;font-weight:700;text-transform:uppercase}.signature .role{text-align:center;margin-top:3px}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>
<div class="letterhead"><img class="seal" src="/branding/logo.jpg"><div class="center"><div class="school">GRANBY COLLEGES OF SCIENCE &amp; TECHNOLOGY</div><div class="department">${escape(doc.department ?? "All Departments")}</div><div class="small">Naic, Cavite, Philippines</div><div class="small">Tel: (046) 412-0437</div></div><div class="right"><img class="seal" src="/branding/logo.jpg"></div></div>
<div class="document-title"><div>SCHOOL ACTIVITIES FOR S.Y. ${escape(schoolYear)}</div><div>${escape(doc.department ?? "All Departments")}</div><div>${escape(semester)}</div></div>
${tableHtml(doc.columns, doc.rows)}
<div class="signature"><div>Prepared by:</div><div class="name">${escape(doc.preparedBy ?? "")}</div><div class="role">${escape(doc.designation ?? "")}</div></div></body></html>`;
  }
  const extra = (doc.extra ?? []).map((s) => `<h2>${escape(s.heading)}</h2>${tableHtml(s.columns, s.rows as never[])}`).join("");
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
h2 { font-size: 11pt; margin: 16px 0 6px; }
@media print {
  thead { display: table-header-group; }
  tr, td, th { break-inside: avoid; page-break-inside: avoid; }
  th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style></head><body><header>
<div class="school">${escape(SCHOOL_NAME)}</div>
${doc.department ? `<div class="meta">${escape(doc.department)}</div>` : ""}
<div class="title">${escape(doc.title)}</div>
<div class="meta">${doc.department ? "Semester" : "School Year and Term"}: ${escape(doc.term)}</div>
<div class="meta">Date Generated: ${escape(generatedOn())}</div>
</header>${tableHtml(doc.columns, doc.rows)}${extra}${doc.preparedBy ? `<div style="margin-top:36px;width:260px;text-align:center"><div style="border-bottom:1px solid #000;padding-bottom:3px;font-weight:bold">${escape(doc.preparedBy)}</div><div style="margin-top:4px">Prepared by / Program Head</div></div>` : ""}</body></html>`;
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
  const header = doc.department
    ? [SCHOOL_NAME, doc.department, doc.title, `Semester: ${doc.term}`, `Date Generated: ${generatedOn()}`, ""]
    : [SCHOOL_NAME, doc.title, `School Year and Term: ${doc.term}`, `Date Generated: ${generatedOn()}`, ""]
    .map(cell)
    .join("\r\n");
  const extra = (doc.extra ?? []).map((s) => `\r\n\r\n${cell(s.heading)}\r\n${toCsv(s.rows as never[], s.columns)}`).join("");
  const signature = doc.preparedBy ? `\r\n\r\n${cell(doc.preparedBy)}\r\n${cell("Prepared by / Program Head")}` : "";
  downloadText(`${doc.filename}.csv`, `${header}\r\n${toCsv(doc.rows, doc.columns)}${extra}${signature}`);
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
  department?: string;
  /** School level label, for example "Senior High School"; blank means every level. */
  level?: string;
  location?: string;
  status?: string;
}

const ACTIVITY_TYPES: Record<string, string> = { SCHOOL_EVENT: "School event", HOLIDAY: "Holiday", CLASS_SUSPENSION: "Class suspension" };

function longDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" });
}

/** Activity columns shared by the activities report and the Class Schedule Report. */
export const ACTIVITY_COLUMNS: Column<ActivityRow>[] = [
  { header: "Date", value: (r) => (r.startDate === r.endDate ? longDate(r.startDate) : `${longDate(r.startDate)} to ${longDate(r.endDate)}`) },
  { header: "Activity", value: (r) => r.title },
  { header: "Time", value: (r) => (r.startMin === null || r.endMin === null ? "Whole day" : `${clock(r.startMin)} to ${clock(r.endMin)}`) },
  { header: "Department", value: (r) => r.department || "All departments" },
  { header: "School Level", value: (r) => r.level || "All levels" },
  { header: "Location", value: (r) => r.location || "" },
  { header: "Status", value: (r) => r.status || "Approved" },
  { header: "Type", value: (r) => ACTIVITY_TYPES[r.type] ?? r.type },
  { header: "Description", value: (r) => r.description },
];

/** Columns for the school activities schedule, sorted by start date. */
export function activitiesDoc(title: string, term: string, rows: ActivityRow[], filename: string): ReportDoc<ActivityRow> {
  return {
    title,
    term,
    filename,
    landscape: true,
    rows: [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startMin ?? -1) - (b.startMin ?? -1)),
    columns: ACTIVITY_COLUMNS,
  };
}
