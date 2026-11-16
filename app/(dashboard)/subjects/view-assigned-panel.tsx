"use client";

import { useCallback, useEffect, useState } from "react";
import { CaretDown } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ErrorState } from "@/components/ux/states";
import { subjectDetailsAction, type SubjectDetails } from "./assignment-actions";
import { groupByFaculty } from "./faculty-popover";
import type { SubjectInfo } from "./types";

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

/** Read-only view of who teaches a subject: faculty, then sections, weekly hours and class schedule, plus recent changes. */
export function ViewAssignedPanel({ subject, term, onClose }: { subject: SubjectInfo; term: { id: string; label: string }; onClose: () => void }) {
  const [details, setDetails] = useState<SubjectDetails | null | "error">(null);
  const hours = subject.lectureHours + subject.labHours;
  const groups = groupByFaculty(subject.assignments);

  const fetchDetails = useCallback(
    () => subjectDetailsAction(subject.id, term.id).then((d) => setDetails(d ?? "error")).catch(() => setDetails("error")),
    [subject.id, term.id],
  );
  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);
  const retry = () => {
    setDetails(null);
    fetchDetails();
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-lg">{subject.code} assigned faculty</SheetTitle>
          <SheetDescription className="text-sm">{subject.name} · {term.label}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {groups.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nobody is assigned to this subject for the term.</p>}
          {groups.map((g) => {
            const meetings = details && details !== "error" ? details.meetings.filter((m) => m.facultyId === g[0].facultyId) : [];
            const allSections = g.some((a) => !a.sectionId);
            const sections = [...new Set(allSections ? meetings.map((m) => m.sectionName) : g.map((a) => a.sectionName))];
            return (
              <details key={g[0].facultyId} open={groups.length === 1} className="group rounded-lg border">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                  <UserAvatar name={g[0].facultyName} className="size-9 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g[0].facultyName}</span>
                    <span className="block text-xs text-muted-foreground">{hours * sections.length} hrs/week · {hours} per section · {allSections ? "All sections" : `${sections.length} ${sections.length === 1 ? "section" : "sections"}`}</span>
                  </span>
                  <CaretDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t p-3">
                  {details === null && <Skeleton className="h-4 w-48" />}
                  {details !== null && sections.map((name) => {
                    const own = meetings.filter((m) => m.sectionName === name);
                    return (
                      <div key={name}>
                        <p className="text-sm font-medium">{name}</p>
                        {own.length === 0 ? <p className="text-xs text-muted-foreground">Not scheduled yet.</p> : (
                          <ul className="mt-1 space-y-1">{own.map((m, i) => <li key={i} className="flex items-baseline justify-between gap-3 text-xs"><span><span className="font-medium">{m.day.slice(0, 3)}</span> <span className="text-muted-foreground">{m.time}</span></span><Badge variant="secondary" className="shrink-0">Room {m.room}</Badge></li>)}</ul>
                        )}
                      </div>
                    );
                  })}
                  {details !== null && sections.length === 0 && <p className="text-xs text-muted-foreground">Not scheduled yet.</p>}
                </div>
              </details>
            );
          })}

          <section aria-labelledby="hist-h" className="space-y-2">
            <h3 id="hist-h" className="text-sm font-semibold">History</h3>
            {details === null && <Skeleton className="h-16 w-full" />}
            {details === "error" && <ErrorState title="Could not load history" description="Check your connection and try again." action={<Button size="sm" onClick={retry}>Retry</Button>} />}
            {details && details !== "error" && (details.history.length === 0 ? <p className="text-sm text-muted-foreground">No assignment changes recorded yet.</p> : (
              <ul className="space-y-2 text-sm">{details.history.map((h) => <li key={h.id}><p>{h.text}</p><p className="text-muted-foreground">{h.who} · {when(h.at)}</p></li>)}</ul>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
