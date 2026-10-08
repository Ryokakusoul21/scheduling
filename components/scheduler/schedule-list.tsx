"use client";

import { useMemo, useState } from "react";
import { WarningOctagon, Warning, CaretUp, CaretDown } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { DAY_SHORT, WEEK_DAYS, formatRange, type Severity } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ux/states";
import type { SchedulerEntry } from "./types";

export interface RowInfo {
  subject: string;
  subjectName: string;
  section: string;
  faculty: string;
  room: string;
}

type SortKey = "day" | "subject" | "section" | "faculty" | "room" | "status";

/** Table view of the filtered classes. Arrow keys move between rows; Enter opens a class. */
export function ScheduleList({
  entries,
  info,
  conflictIndex,
  onOpen,
}: {
  entries: SchedulerEntry[];
  info: (e: SchedulerEntry) => RowInfo;
  conflictIndex: Map<string, { severity: Severity; messages: string[] }>;
  onOpen: (e: SchedulerEntry) => void;
}) {
  const { ref: rovingRef, onKeyDown: onRovingKeyDown, onFocus: onRovingFocus } = useRovingFocus<HTMLTableSectionElement>();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "day", dir: 1 });

  const rows = useMemo(() => {
    const value = (e: SchedulerEntry): string | number => {
      const i = info(e);
      switch (sort.key) {
        case "day":
          return WEEK_DAYS.indexOf(e.dayOfWeek) * 10000 + e.startMin;
        case "subject":
          return i.subject;
        case "section":
          return i.section;
        case "faculty":
          return i.faculty;
        case "room":
          return i.room;
        case "status":
          return e.status;
      }
    };
    return [...entries].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
  }, [entries, info, sort]);

  if (entries.length === 0) {
    return <EmptyState title="No classes match these filters" description="Change the filters above, or add a class." />;
  }

  const header = (key: SortKey, label: string) => (
    <TableHead aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <CaretUp className="size-3" /> : <CaretDown className="size-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {header("day", "Day & time")}
            {header("subject", "Subject")}
            {header("section", "Section")}
            {header("faculty", "Faculty")}
            {header("room", "Room")}
            {header("status", "Status")}
          </TableRow>
        </TableHeader>
        <TableBody ref={rovingRef} onKeyDown={onRovingKeyDown} onFocus={onRovingFocus}>
          {rows.map((e) => {
            const i = info(e);
            const c = conflictIndex.get(e.id);
            return (
              <TableRow
                key={e.id}
                data-roving=""
                data-entry-id={e.id}
                tabIndex={-1}
                onClick={() => onOpen(e)}
                aria-label={`${i.subject} ${i.section}, ${DAY_SHORT[e.dayOfWeek]} ${formatRange(e.startMin, e.endMin)}${c ? `, ${c.severity}` : ""}. Press Enter to edit.`}
                className={cn(
                  "cursor-pointer",
                  c?.severity === "conflict" && "bg-red-500/[0.07] hover:bg-red-500/10",
                  c?.severity === "warning" && "bg-amber-500/[0.06]"
                )}
              >
                <TableCell className="whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    {c?.severity === "conflict" && <WarningOctagon className="size-4 text-red-600" weight="fill" aria-hidden />}
                    {c?.severity === "warning" && <Warning className="size-4 text-amber-600" weight="fill" aria-hidden />}
                    <span className="font-medium">{DAY_SHORT[e.dayOfWeek]}</span> {formatRange(e.startMin, e.endMin)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{i.subject}</span>
                  <span className="block max-w-56 truncate text-xs text-muted-foreground">
                    {i.subjectName} · {e.component === "LABORATORY" ? "Lab" : "Lecture"}
                  </span>
                </TableCell>
                <TableCell>{i.section}</TableCell>
                <TableCell>{i.faculty}</TableCell>
                <TableCell>{i.room}</TableCell>
                <TableCell>
                  <Badge variant={e.status === "PUBLISHED" ? "default" : e.status === "ARCHIVED" ? "outline" : "secondary"}>
                    {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
