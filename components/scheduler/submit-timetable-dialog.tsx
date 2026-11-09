"use client";

import { CircleNotch, LockSimple, UploadSimple } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface SubmitSummary {
  department: string;
  terms: string[];
  programs: { code: string; years: string[]; sections: number }[];
  sections: number;
  classes: number;
  drafts: number;
}

/** Confirms sending the department's whole timetable, showing exactly what the package contains. */
export function SubmitTimetableDialog({ summary, open, pending, onOpenChange, onConfirm }: { summary: SubmitSummary | null; open: boolean; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UploadSimple className="size-5 text-primary" /> Submit the whole timetable</DialogTitle>
          <DialogDescription>{summary?.department} sends every program, year, and section for {summary?.terms.join(" and ")} to the Super Administrator as one package.</DialogDescription>
        </DialogHeader>

        {summary && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-3 text-center">
              {([["Sections", summary.sections], ["Classes", summary.classes], ["New or changed", summary.drafts]] as const).map(([label, value]) => (
                <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-2xl font-bold tabular-nums">{value}</dd></div>
              ))}
            </dl>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Included</p>
              <ul className="divide-y rounded-xl border">
                {summary.programs.map((p) => (
                  <li key={p.code} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="font-medium">{p.code}</span>
                    <span className="text-right text-xs text-muted-foreground">{p.years.join(", ")} · {p.sections} section{p.sections === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
              <LockSimple className="mt-0.5 size-4 shrink-0" weight="fill" />
              The timetable is locked until the Super Administrator decides. You can withdraw it before then to make changes.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || !summary} onClick={onConfirm}>
            {pending ? <CircleNotch className="size-4 animate-spin" /> : <UploadSimple className="size-4" />} Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
