"use client";

import { useState } from "react";
import { WarningOctagon } from "@phosphor-icons/react/ssr";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ux/native-select";
import { stageLabel } from "@/lib/academics/levels";
import { Badge } from "@/components/ui/badge";
import { SectionSheet, type SheetSource } from "@/components/scheduler/schedule-sheet";
import type { SchedulerData, SchedulerEntry } from "@/components/scheduler/types";
import { formatRange } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { CommentBox } from "./review-panel";

export interface ReviewSheetData {
  submissionId: string;
  departmentName: string;
  termLabel: string;
  sections: (SchedulerData["sections"][number] & { programName: string | null })[];
  entries: SchedulerEntry[];
  subjects: SchedulerData["subjects"];
  faculty: SchedulerData["faculty"];
  rooms: SchedulerData["rooms"];
  submitted: string[];
  flagged: string[];
  comments: { id: string; rowId: string; author: string; body: string }[];
  canComment: boolean;
}

const DAY = (d: string) => d.charAt(0) + d.slice(1).toLowerCase();

/** Section tabs with the full weekly sheet the Head of Department built; submitted classes outlined, conflicts in red. */
export function ReviewSheets({ data }: { data: ReviewSheetData }) {
  const submitted = new Set(data.submitted);
  const flagged = new Set(data.flagged);
  const subjects = new Map(data.subjects.map((x) => [x.id, x]));
  const faculty = new Map(data.faculty.map((x) => [x.id, x]));
  const rooms = new Map(data.rooms.map((x) => [x.id, x]));
  const countOf = (id: string) => data.entries.filter((e) => e.sectionId === id && submitted.has(e.id)).length;
  const clashOf = (id: string) => data.entries.some((e) => e.sectionId === id && flagged.has(e.id));
  const program = (s: ReviewSheetData["sections"][number]) => s.shortName.split(" ")[0];

  const [onlySubmitted, setOnlySubmitted] = useState(data.submitted.length > 0);
  const [programFilter, setProgramFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [active, setActive] = useState(() => data.sections.find((x) => countOf(x.id) > 0)?.id ?? data.sections[0]?.id ?? "");

  const shown = data.sections.filter((x) => (!onlySubmitted || countOf(x.id) > 0) && (!programFilter || program(x) === programFilter) && (!yearFilter || stageLabel(x) === yearFilter));
  const section = shown.find((x) => x.id === active) ?? shown[0];
  const programs = [...new Set(data.sections.map(program))].sort();
  const years = [...new Set(data.sections.map((x) => stageLabel(x)))].sort();

  const filters = (
    <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto] lg:items-end">
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Program
        <NativeSelect aria-label="Program" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} options={[{ value: "", label: "All programs" }, ...programs.map((p) => ({ value: p, label: p }))]} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Year
        <NativeSelect aria-label="Year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} options={[{ value: "", label: "All years" }, ...years.map((y) => ({ value: y, label: y }))]} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Section
        <NativeSelect aria-label="Section" value={section?.id ?? ""} onChange={(e) => setActive(e.target.value)} disabled={!shown.length}
          options={shown.map((x) => ({ value: x.id, label: `${x.shortName} · ${countOf(x.id)} new or changed${clashOf(x.id) ? " · has conflicts" : ""}` }))} />
      </label>
      <label className="flex h-9 cursor-pointer items-center gap-2 text-sm select-none">
        <Checkbox checked={onlySubmitted} onCheckedChange={(on) => setOnlySubmitted(!!on)} /> Only sections with new or changed classes
      </label>
    </div>
  );
  if (!section) return <div className="space-y-4">{filters}<p className="text-sm text-muted-foreground">No sections match these filters.</p></div>;

  const source: SheetSource = { section, entries: data.entries, subjects, faculty, rooms, programName: section.programName, departmentName: data.departmentName, termLabel: data.termLabel };
  const mine = data.entries.filter((e) => e.sectionId === section.id && submitted.has(e.id)).sort((a, b) => a.dayOfWeek.localeCompare(b.dayOfWeek) || a.startMin - b.startMin);
  const notes = (id: string) => data.comments.filter((c) => c.rowId === id);

  return (
    <div className="space-y-4">
      {filters}
      {clashOf(section.id) && <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400"><WarningOctagon className="size-4" weight="fill" /> {section.shortName} has classes in conflict, outlined in red.</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm ring-2 ring-inset ring-blue-600" /> New or changed in this submission</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm ring-[3px] ring-inset ring-red-600" /> Conflict</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border" /> Unchanged, already published</span>
      </div>

      <SectionSheet source={source} highlight={submitted} flagged={flagged} />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <p className="border-b px-4 py-2.5 text-sm font-semibold">New or changed classes in {section.shortName} <span className="font-normal text-muted-foreground">· {mine.length}</span></p>
        {mine.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Nothing in this section changed; its sheet shows the published timetable included in the package.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Subject</th><th className="px-4 py-2 font-medium">Day and time</th><th className="px-4 py-2 font-medium">Room</th><th className="px-4 py-2 font-medium">Faculty</th>{data.canComment && <th className="w-10" />}</tr>
            </thead>
            <tbody>
              {mine.map((e) => {
                const subject = subjects.get(e.subjectId);
                const label = `${section.shortName} · ${subject?.code ?? "Class"}${e.component === "LABORATORY" ? " (Laboratory)" : ""} · ${DAY(e.dayOfWeek)} ${formatRange(e.startMin, e.endMin)}`;
                return (
                  <tr key={e.id} className={cn("border-t", flagged.has(e.id) && "bg-red-500/5")}>
                    <td className="px-4 py-2 align-top font-medium">
                      {subject?.code}{e.component === "LABORATORY" ? " (Laboratory)" : ""}
                      {flagged.has(e.id) && <Badge variant="destructive" className="ml-2">Conflict</Badge>}
                      {notes(e.id).map((c) => <p key={c.id} className="mt-1 text-xs font-normal text-amber-700 dark:text-amber-400">{c.author}: {c.body}</p>)}
                    </td>
                    <td className="px-4 py-2 align-top whitespace-nowrap">{DAY(e.dayOfWeek)}, {formatRange(e.startMin, e.endMin)}</td>
                    <td className="px-4 py-2 align-top">{rooms.get(e.roomId)?.roomName}</td>
                    <td className="px-4 py-2 align-top">{faculty.get(e.facultyId)?.fullName}</td>
                    {data.canComment && <td className="px-2 py-1 align-top"><CommentBox compact submissionId={data.submissionId} rowId={e.id} rowLabel={label} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
