"use client";

import { useCallback, useEffect, useState } from "react";
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
        <div className="space-y-6 px-4 pb-6">
          {groups.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nobody is assigned to this subject for the term.</p>}
          {groups.map((g) => {
            const meetings = details && details !== "error" ? details.meetings.filter((m) => m.facultyId === g[0].facultyId) : [];
            return (
              <section key={g[0].facultyId} aria-label={g[0].facultyName} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <UserAvatar name={g[0].facultyName} className="size-9 text-xs" />
                  <div>
                    <p className="text-sm font-medium">{g[0].facultyName}</p>
                    <p className="text-sm text-muted-foreground">{hours} hrs/week</p>
                  </div>
                </div>
                <p className="text-sm"><span className="text-muted-foreground">Sections: </span>{g.some((a) => !a.sectionId) ? "All sections" : g.map((a) => a.sectionName).join(", ")}</p>
                <div className="text-sm">
                  <p className="text-muted-foreground">Schedule</p>
                  {details === null ? <Skeleton className="mt-1 h-4 w-48" /> : meetings.length === 0 ? <p>Not scheduled yet.</p> : (
                    <ul className="mt-1 space-y-0.5">{meetings.map((m, i) => <li key={i}>{m.sectionName} · {m.day} {m.time} · Room {m.room}</li>)}</ul>
                  )}
                </div>
              </section>
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
