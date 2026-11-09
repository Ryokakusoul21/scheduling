"use client";

import Image from "next/image";
import { useMemo } from "react";
import { formatRange } from "@/lib/scheduler/timetable";
import { stageLabel } from "@/lib/academics/levels";
import type { DayOfWeek } from "@/lib/scheduler/types";
import { cn } from "@/lib/utils";
import type { SchedulerData, SchedulerEntry } from "./types";

const DAYS: [DayOfWeek, string][] = [["MONDAY", "MONDAY"], ["TUESDAY", "TUESDAY"], ["WEDNESDAY", "WEDNESDAY"], ["THURSDAY", "THURSDAY"], ["FRIDAY", "FRIDAY"], ["SATURDAY", "SATURDAY"]];
const STEP = 30;
const ROW_PX = 40;
const MIN_START = 7 * 60;
const MIN_END = 16 * 60;

const esc = (t: string | number | null | undefined) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const PRINT_FILLS = ["#eff6ff", "#ecfdf5", "#fffbeb", "#f5f3ff", "#fff1f2", "#ecfeff", "#f7fee7", "#fff7ed"];

/** One schedule sheet as self-contained HTML (plain table with merged cells), so printing never depends on the app's styles. */
function sheetHtml(source: SheetSource) {
  const { section, subjects, faculty, rooms } = source;
  const classes = source.entries.filter((e) => e.sectionId === section.id && e.status !== "ARCHIVED");
  const start = Math.min(MIN_START, ...classes.map((e) => Math.floor(e.startMin / STEP) * STEP));
  const end = Math.max(MIN_END, ...classes.map((e) => Math.ceil(e.endMin / STEP) * STEP));
  const count = Math.max(1, Math.round((end - start) / STEP));
  const subjectIds = [...new Set(classes.map((e) => e.subjectId))];

  // cell[row][day] holds the class that starts there, or "covered" when a taller class above spans into it.
  const cell: (SchedulerEntry | "covered" | null)[][] = Array.from({ length: count }, () => DAYS.map(() => null));
  const span = (e: SchedulerEntry) => Math.max(1, Math.ceil((e.endMin - e.startMin) / STEP));
  for (const e of classes) {
    const day = DAYS.findIndex(([d]) => d === e.dayOfWeek);
    const row = Math.floor((e.startMin - start) / STEP);
    if (day < 0 || row < 0 || row >= count) continue;
    for (let i = 0; i < span(e) && row + i < count; i++) cell[row + i][day] = i === 0 ? e : "covered";
  }

  const body = cell.map((cols, r) => {
    const m = start + r * STEP;
    const tds = cols.map((c) => {
      if (c === "covered") return "";
      if (!c) return "<td></td>";
      const subj = subjects.get(c.subjectId);
      return `<td rowspan="${span(c)}" class="cls" style="background:${PRINT_FILLS[subjectIds.indexOf(c.subjectId) % PRINT_FILLS.length]}"><b>${esc(subj?.name ?? "Class")}${c.component === "LABORATORY" ? " (Laboratory)" : ""}</b><br>(${esc(rooms.get(c.roomId)?.roomName ?? "Room to be announced")})</td>`;
    }).join("");
    return `<tr><td class="t">${clock(m)}</td><td class="t">${clock(m + STEP)}</td>${tds}</tr>`;
  }).join("");

  const subjectRows = subjectIds.map((id) => {
    const sub = subjects.get(id);
    const names = [...new Set(classes.filter((e) => e.subjectId === id).map((e) => faculty.get(e.facultyId)?.fullName).filter(Boolean))].join(", ");
    return `<tr><td>${esc(sub?.code)}</td><td>${esc(sub?.name)}</td><td>${esc(sub?.units)}</td><td>${esc(names)}</td></tr>`;
  }).join("") || '<tr><td colspan="4">No classes scheduled yet.</td></tr>';

  const details = [["Course", source.programName], ["Year", stageLabel(section)], ["Section", section.shortName], ["No. of Students", section.studentCount ? section.studentCount : null]]
    .filter(([, v]) => v).map(([k, v]) => `<tr><td class="k">${k}</td><td><b>: ${esc(v)}</b></td></tr>`).join("");

  return `<section class="sheet">
    <div class="head"><img src="${location.origin}/branding/logo.jpg" alt="" width="64" height="64"><div><b>GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY</b>${source.departmentName ? `<div class="dept">${esc(source.departmentName)}</div>` : ""}<div>Naic, Cavite, Philippines</div></div></div>
    <div class="title"><b>SCHEDULE OF CLASSES</b><div>${esc(source.termLabel)}</div></div>
    <table class="info">${details}</table>
    <table class="grid"><thead><tr><th colspan="2">TIME</th>${DAYS.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
    <table class="subjects"><thead><tr><th>SUBJ CODE</th><th>SUBJECT TITLE</th><th>UNITS</th><th>INSTRUCTOR/S</th></tr></thead><tbody>${subjectRows}</tbody></table>
  </section>`;
}

const PRINT_CSS = `@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:11px}
.sheet{page-break-after:always;padding:4px}.sheet:last-child{page-break-after:auto}
.head{display:flex;align-items:center;justify-content:center;gap:14px;text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px;line-height:1.3}.head b{font-size:13px}.dept{font-size:17px;font-weight:700}
.title{text-align:center;margin-bottom:8px}.info{margin:0 auto 10px;border-collapse:collapse}.info td{padding:1px 6px}.k{width:110px}
table.grid,table.subjects{width:100%;border-collapse:collapse;table-layout:fixed}.grid th,.grid td,.subjects th,.subjects td{border:1px solid #000;text-align:center;padding:0 2px}
.grid th{height:22px;font-size:10px}.grid td{height:24px;font-size:9px}.grid td.t{width:38px;font-size:9px}.grid td.cls{vertical-align:middle;line-height:1.25;overflow:hidden}
.subjects{margin:14px auto 0;width:90%}.subjects th{background:#f3f4f6;font-size:10px}.subjects td{font-size:10px;padding:2px 4px}
`;

/** Prints the given sheets from a hidden frame, so no tab opens and no page layout, dialog or scroll box can clip them. */
export function printSheets(sources: SheetSource[], title: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return frame.remove();
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${sources.map(sheetHtml).join("")}</body></html>`);
  doc.close();
  win.addEventListener("afterprint", () => frame.remove());
  // Give the logo a moment to load before the print dialog opens.
  setTimeout(() => { win.focus(); win.print(); }, 700);
}

/** Clock time without AM or PM, as on the paper schedule (1:00 for 1 PM). */
const clock = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")}`;

/** Soft fills cycled by subject so neighbouring classes stay easy to tell apart. */
const FILLS = ["bg-blue-50", "bg-emerald-50", "bg-amber-50", "bg-violet-50", "bg-rose-50", "bg-cyan-50", "bg-lime-50", "bg-orange-50"];

export interface SheetSource {
  section: SchedulerData["sections"][number];
  entries: SchedulerEntry[];
  subjects: Map<string, SchedulerData["subjects"][number]>;
  faculty: Map<string, SchedulerData["faculty"][number]>;
  rooms: Map<string, SchedulerData["rooms"][number]>;
  programName: string | null;
  departmentName: string | null;
  termLabel: string;
}

/** One printable "Schedule of Classes" page for a section, laid out like the paper schedule. */
/** highlight outlines classes in blue (for example, those in a submission); flagged outlines conflicts in red. */
export function SectionSheet({ source, className, highlight, flagged }: { source: SheetSource; className?: string; highlight?: ReadonlySet<string>; flagged?: ReadonlySet<string> }) {
  const { section, entries, subjects, faculty, rooms } = source;
  const rows = useMemo(() => {
    const classes = entries.filter((e) => e.sectionId === section.id && e.status !== "ARCHIVED");
    const start = Math.min(MIN_START, ...classes.map((e) => Math.floor(e.startMin / STEP) * STEP));
    const end = Math.max(MIN_END, ...classes.map((e) => Math.ceil(e.endMin / STEP) * STEP));
    return { classes, start, count: Math.max(1, Math.round((end - start) / STEP)) };
  }, [entries, section.id]);

  const subjectIds = [...new Set(rows.classes.map((e) => e.subjectId))];
  const fillOf = (id: string) => FILLS[subjectIds.indexOf(id) % FILLS.length];
  const roomName = (id: string) => rooms.get(id)?.roomName ?? "Room to be announced";
  const teachers = (subjectId: string) => [...new Set(rows.classes.filter((e) => e.subjectId === subjectId).map((e) => faculty.get(e.facultyId)?.fullName).filter(Boolean))].join(", ");
  const slots = Array.from({ length: rows.count }, (_, i) => rows.start + i * STEP);

  return (
    <article className={cn("break-after-page space-y-4 rounded-xl border bg-white p-5 text-black shadow-xs print:rounded-none print:border-0 print:shadow-none", className)} aria-label={`Schedule of classes, ${section.name}`}>
      <header className="flex items-center justify-center gap-4 border-b-2 border-black pb-3 text-center">
        <Image src="/branding/logo.jpg" alt="" width={56} height={56} className="size-14 rounded-full object-cover" />
        <div className="leading-tight">
          <p className="text-sm font-bold">GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY</p>
          {source.departmentName && <p className="text-lg font-bold">{source.departmentName}</p>}
          <p className="text-xs">Naic, Cavite, Philippines</p>
        </div>
      </header>

      <div className="text-center leading-tight">
        <p className="text-sm font-bold">SCHEDULE OF CLASSES</p>
        <p className="text-xs">{source.termLabel}</p>
      </div>

      <dl className="mx-auto grid max-w-md grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 text-xs">
        {[
          ["Course", source.programName],
          ["Year", stageLabel(section)],
          ["Section", section.shortName],
          ["No. of Students", section.studentCount ? String(section.studentCount) : null],
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents"><dt>{k}</dt><dd className="font-bold">: {v}</dd></div>
        ))}
      </dl>

      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] border-l border-t border-black text-[11px]" style={{ gridTemplateColumns: "44px 44px repeat(6, minmax(0, 1fr))", gridTemplateRows: `28px repeat(${rows.count}, ${ROW_PX}px)` }}>
          <div className="col-span-2 flex items-center justify-center border-b border-r border-black font-bold">TIME</div>
          {DAYS.map(([d, label]) => <div key={d} className="flex items-center justify-center border-b border-r border-black font-bold">{label}</div>)}
          {slots.map((m, i) => (
            <div key={m} className="contents">
              <div className="flex items-center justify-center border-b border-r border-black" style={{ gridRow: i + 2, gridColumn: 1 }}>{clock(m)}</div>
              <div className="flex items-center justify-center border-b border-r border-black" style={{ gridRow: i + 2, gridColumn: 2 }}>{clock(m + STEP)}</div>
              {DAYS.map((_, c) => <div key={c} className="border-b border-r border-black/60" style={{ gridRow: i + 2, gridColumn: c + 3 }} />)}
            </div>
          ))}
          {rows.classes.map((e) => {
            const subject = subjects.get(e.subjectId);
            const first = Math.floor((e.startMin - rows.start) / STEP) + 2;
            const span = Math.max(1, Math.ceil((e.endMin - e.startMin) / STEP));
            return (
              <div
                key={e.id}
                className={cn("z-[1] flex flex-col items-center justify-center gap-0 overflow-hidden border-b border-r border-black px-1 text-center text-[10px] leading-[1.2]", fillOf(e.subjectId), highlight?.has(e.id) && "ring-2 ring-inset ring-blue-600", flagged?.has(e.id) && "ring-[3px] ring-inset ring-red-600")}
                style={{ gridRow: `${first} / span ${span}`, gridColumn: DAYS.findIndex(([d]) => d === e.dayOfWeek) + 3 }}
                title={`${subject?.code ?? ""} ${formatRange(e.startMin, e.endMin)}`}
              >
                <span className="font-semibold">{subject?.name ?? "Class"}{e.component === "LABORATORY" ? " (Laboratory)" : ""}</span>
                <span>({roomName(e.roomId)})</span>
              </div>
            );
          })}
        </div>
      </div>

      <table className="mx-auto w-full max-w-3xl border-collapse text-xs">
        <thead>
          <tr className="bg-neutral-100">
            {["SUBJ CODE", "SUBJECT TITLE", "UNITS", "INSTRUCTOR/S"].map((h) => <th key={h} className="border border-black px-2 py-1 font-bold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {subjectIds.length === 0 && <tr><td colSpan={4} className="border border-black px-2 py-3 text-center">No classes scheduled yet.</td></tr>}
          {subjectIds.map((id) => {
            const s = subjects.get(id);
            return (
              <tr key={id}>
                <td className="border border-black px-2 py-0.5 text-center">{s?.code}</td>
                <td className="border border-black px-2 py-0.5 text-center">{s?.name}</td>
                <td className="border border-black px-2 py-0.5 text-center">{s?.units}</td>
                <td className="border border-black px-2 py-0.5 text-center">{teachers(id)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
