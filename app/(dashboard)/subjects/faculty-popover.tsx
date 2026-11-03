"use client";

import { CaretDown } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AssignmentRow } from "./types";

/** Assigned faculty grouped by person, with the sections each one teaches. */
export function groupByFaculty(assignments: AssignmentRow[]) {
  return [...assignments.reduce((m, a) => m.set(a.facultyId, [...(m.get(a.facultyId) ?? []), a]), new Map<string, AssignmentRow[]>()).values()];
}

const sectionsOf = (rows: AssignmentRow[]) => (rows.some((a) => !a.sectionId) ? "All sections" : rows.map((a) => a.sectionName).join(", "));

/** Stacked avatars and the lead teacher on one line; the "+N" chip opens everyone with sections and weekly hours. */
export function FacultyPopover({ assignments, hours, onView }: { assignments: AssignmentRow[]; hours: number; onView: () => void }) {
  const groups = groupByFaculty(assignments);
  const shown = groups.slice(0, 3);
  const rest = groups.length - 1;
  return (
    <Popover>
      <PopoverTrigger
        className="flex max-w-64 items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${groups.length} assigned faculty. Show all with sections and hours.`}
      >
        <span className="flex -space-x-2">
          {shown.map((g) => <UserAvatar key={g[0].facultyId} name={g[0].facultyName} className="size-7 text-[10px] ring-2 ring-card" />)}
        </span>
        <span className="min-w-0 truncate text-sm font-medium">{groups[0][0].facultyName}</span>
        {rest > 0 && <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">+{rest} <CaretDown className="size-3" aria-hidden /></span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g[0].facultyId} className="flex items-start gap-2">
              <UserAvatar name={g[0].facultyName} className="size-8 text-xs" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{g[0].facultyName}</p>
                <p className="text-sm text-muted-foreground">{sectionsOf(g)} · {hours} hrs/week</p>
              </div>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="w-full" onClick={onView}>View assigned faculty</Button>
      </PopoverContent>
    </Popover>
  );
}
