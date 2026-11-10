/** Printable and spreadsheet reports with the institution header, built from the same column list. */
import { cell, downloadText, toCsv, type Column } from "./csv";

export const SCHOOL_NAME = "GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY";

export interface ReportDoc<T> {
  title: string;
  /** School year and semester or term, for example "2026-2027 · First Semester". */
  term: string;
  columns: Column<T>[];
  rows: T[];
  filename: string;
  landscape?: boolean;
  /** A more structured print layout for class, teacher, and room timetables. */
  variant?: "timetable";
  timetableDetails?: TimetablePrintDetails;
  /** Optional official-document department heading and preparer signature. */
  department?: string;
  preparedBy?: string;
  designation?: string;
  /** Formal GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY two-column school-activities document. */
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
  units?: number;
}

export interface TimetablePrintDetails {
  course?: string | null;
  year?: string | null;
  section?: string | null;
  studentCount?: number | null;
  department?: string | null;
  focus?: "faculty" | "room";
  focusName?: string | null;
}

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

function clock(min: number) {
  const h = Math.floor(min / 60);
  return `${((h + 11) % 12) + 1}:${String(min % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Columns for class, teacher, and room timetables; rows are sorted by day and start time. */
export function timetableDoc(title: string, term: string, rows: TimetableRow[], filename: string, details?: TimetablePrintDetails): ReportDoc<TimetableRow> {
  return {
    title,
    term,
    filename,
    landscape: true,
    variant: "timetable",
    timetableDetails: details,
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

const PRINT_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const PRINT_STEP = 30;

function printClock(min: number) {
  const hour = Math.floor(min / 60) % 12 || 12;
  return `${hour}:${String(min % 60).padStart(2, "0")}`;
}

function timetablePrintHtml(doc: ReportDoc<TimetableRow>) {
  const rows = doc.rows;
  const start = Math.min(7 * 60, ...rows.map((row) => Math.floor(row.startMin / PRINT_STEP) * PRINT_STEP));
  const end = Math.max(16 * 60, ...rows.map((row) => Math.ceil(row.endMin / PRINT_STEP) * PRINT_STEP));
  const slotCount = Math.max(1, Math.ceil((end - start) / PRINT_STEP));
  const grid: (TimetableRow | "covered" | null)[][] = Array.from({ length: slotCount }, () => PRINT_DAYS.map(() => null));
  const spanOf = (row: TimetableRow) => Math.max(1, Math.ceil((row.endMin - row.startMin) / PRINT_STEP));

  for (const row of rows) {
    const day = PRINT_DAYS.indexOf(row.dayOfWeek.toUpperCase());
    const slot = Math.floor((row.startMin - start) / PRINT_STEP);
    if (day < 0 || slot < 0 || slot >= slotCount) continue;
    if (grid[slot][day]) continue;
    grid[slot][day] = row;
    for (let offset = 1; offset < spanOf(row) && slot + offset < slotCount; offset++) grid[slot + offset][day] = "covered";
  }

  const bodyRows = grid.map((dayCells, index) => {
    const time = start + index * PRINT_STEP;
    const meetings = dayCells.map((row) => {
      if (row === "covered") return "";
      if (!row) return "<td></td>";
      const [code, ...name] = row.subject.split(" - ");
      const title = name.length ? name.join(" - ") : code;
      const context = doc.timetableDetails?.focus === "faculty"
        ? `${row.section} · ${row.room}`
        : doc.timetableDetails?.focus === "room"
          ? `${row.section} · ${row.faculty}`
          : row.room;
      return `<td rowspan="${spanOf(row)}" class="meeting"><b>${escape(title)}${row.component === "LABORATORY" ? " (Laboratory)" : ""}</b><br>(${escape(context)})</td>`;
    }).join("");
    return `<tr><td class="time">${printClock(time)}</td><td class="time">${printClock(time + PRINT_STEP)}</td>${meetings}</tr>`;
  }).join("");

  const details = [
    ["Course", doc.timetableDetails?.course],
    ["Year", doc.timetableDetails?.year],
    ["Section", doc.timetableDetails?.section],
    ["No. of Students", doc.timetableDetails?.studentCount],
    ["Department", doc.timetableDetails?.department],
    ["Focus", doc.timetableDetails?.focusName],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<tr><td class="label">${escape(label)}</td><td><b>: ${escape(value)}</b></td></tr>`).join("");

  const subjects = new Map<string, TimetableRow[]>();
  for (const row of rows) {
    const [code, ...name] = row.subject.split(" - ");
    const key = code.trim();
    subjects.set(key, [...(subjects.get(key) ?? []), row]);
  }
  const subjectRows = [...subjects.entries()].map(([code, meetings]) => {
    const first = meetings[0];
    const [, ...name] = first.subject.split(" - ");
    const instructors = [...new Set(meetings.map((meeting) => meeting.faculty).filter(Boolean))].join(", ");
    return `<tr><td>${escape(code)}</td><td>${escape(name.join(" - ") || code)}</td><td>${escape(first.units ?? "")}</td><td>${escape(instructors)}</td></tr>`;
  }).join("") || '<tr><td colspan="4">No classes scheduled yet.</td></tr>';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.title)}</title><style>
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;padding:8mm;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:11px}
.sheet{padding:4px}.head{display:flex;align-items:center;justify-content:center;gap:14px;text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px;line-height:1.3}.head img{object-fit:contain}.head b{font-size:13px}.dept{font-size:17px;font-weight:700}
.title{text-align:center;margin-bottom:8px}.title .term{margin-top:2px}.info{margin:0 auto 10px;border-collapse:collapse}.info td{padding:1px 6px}.info .label{width:110px}
table.grid,table.subjects{width:100%;border-collapse:collapse;table-layout:fixed}.grid th,.grid td,.subjects th,.subjects td{border:1px solid #000;text-align:center;padding:0 2px}
.grid th{height:22px;font-size:10px}.grid td{height:24px;font-size:9px}.grid td.time{width:38px;font-size:9px}.grid td.meeting{vertical-align:middle;line-height:1.25;overflow-wrap:anywhere}
.subjects{margin:14px auto 0;width:90%}.subjects th{background:#f3f4f6;font-size:10px}.subjects td{font-size:10px;padding:2px 4px}
@media print{thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><section class="sheet"><div class="head"><img src="${escape(`${globalThis.location?.origin ?? ""}/branding/logo.jpg`)}" alt="" width="64" height="64"><div><b>${escape(SCHOOL_NAME)}</b>${doc.timetableDetails?.department ? `<div class="dept">${escape(doc.timetableDetails.department)}</div>` : ""}<div>Naic, Cavite, Philippines</div></div></div>
<div class="title"><b>SCHEDULE OF CLASSES</b><div class="term">${escape(doc.term)}</div></div><table class="info">${details}</table>
<table class="grid"><thead><tr><th colspan="2">TIME</th>${PRINT_DAYS.map((day) => `<th>${day}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table>
<table class="subjects"><thead><tr><th>SUBJ CODE</th><th>SUBJECT TITLE</th><th>UNITS</th><th>INSTRUCTOR/S</th></tr></thead><tbody>${subjectRows}</tbody></table></section></body></html>`;
}

export function reportHtml<T>(doc: ReportDoc<T>) {
  if (doc.variant === "timetable") return timetablePrintHtml(doc as unknown as ReportDoc<TimetableRow>);
  if (doc.officialActivities) {
    const [schoolYear, semester] = doc.term.split(" · ");
    const logoUrl = `${globalThis.location?.origin ?? ""}/branding/logo.jpg`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.title)}</title><style>
@page{size:letter portrait;margin:0}*{box-sizing:border-box}body{font-family:"Times New Roman",serif;color:#000;margin:0;padding:12mm;font-size:11pt}.letterhead{display:grid;grid-template-columns:72px 1fr;align-items:center;border-bottom:2px solid #000;padding-bottom:8px}.seal{width:64px;height:64px;object-fit:contain}.center{text-align:center}.school{font-weight:700;font-size:14pt}.department{font-weight:700;font-size:16pt;margin-top:2px}.small{font-size:9.5pt}.document-title{text-align:center;font-weight:700;margin:20px 0 14px;line-height:1.55}.document-title div{text-transform:uppercase}table{width:100%;table-layout:fixed;border-collapse:collapse}th,td{border:1.5px solid #000;padding:6px 8px;vertical-align:top;overflow-wrap:anywhere}th{text-align:center;font-weight:700}th:first-child,td:first-child{width:38%}th:last-child,td:last-child{width:62%}.signature{margin-top:36px;width:310px}.signature .name{margin-top:34px;border-bottom:1px solid #000;text-align:center;font-weight:700;text-transform:uppercase}.signature .role{text-align:center;margin-top:3px}@media print{thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}}</style></head><body>
<div class="letterhead"><img class="seal" src="${escape(logoUrl)}" alt="School seal"><div class="center"><div class="school">GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY</div><div class="department">${escape(doc.department ?? "All Departments")}</div><div class="small">Naic, Cavite, Philippines</div><div class="small">Tel: (046) 412-0437</div></div></div>
<div class="document-title"><div>SCHOOL ACTIVITIES FOR S.Y. ${escape(schoolYear)}</div><div>${escape(doc.department ?? "All Departments")}</div><div>${escape(semester)}</div></div>
${tableHtml(doc.columns, doc.rows)}
<div class="signature"><div>Prepared by:</div><div class="name">${escape(doc.preparedBy ?? "")}</div><div class="role">${escape(doc.designation ?? "")}</div></div></body></html>`;
  }
  const extra = (doc.extra ?? []).map((s) => `<h2>${escape(s.heading)}</h2>${tableHtml(s.columns, s.rows as never[])}`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.title)}</title><style>
@page { size: ${doc.landscape ? "A4 landscape" : "A4 portrait"}; margin: 0; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; margin: 0; padding: 12mm; }
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
  const imageLoads = Array.from(win.document.images).map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }));
  void Promise.race([Promise.all(imageLoads), new Promise((resolve) => setTimeout(resolve, 2000))]).then(() => {
    win.focus();
    win.print();
  });
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
