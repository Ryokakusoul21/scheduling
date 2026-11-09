"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, CheckCircle, Hourglass, LockSimple, WarningCircle } from "@phosphor-icons/react/ssr";
import type { TimetableSubmissionStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { withdrawSubmissionAction } from "@/app/(dashboard)/scheduler/actions";
import { cn } from "@/lib/utils";

export interface SubmissionNoticeRow {
  id: string;
  title: string;
  status: TimetableSubmissionStatus;
  reason: string | null;
  date: string;
  publishAt: string | null;
  comments: { id: string; row: string | null; body: string }[];
}

const STYLE: Record<TimetableSubmissionStatus, { icon: typeof Hourglass; tone: string; text: string }> = {
  SUBMITTED: { icon: LockSimple, tone: "border-blue-500/30 bg-blue-500/5", text: "Submitted and waiting for the Super Administrator. Editing is locked; withdraw it to make changes." },
  APPROVED: { icon: Hourglass, tone: "border-blue-500/30 bg-blue-500/5", text: "Approved and waiting to be published; editing stays locked." },
  PUBLISHED: { icon: CheckCircle, tone: "border-emerald-500/30 bg-emerald-500/5", text: "Published and visible to faculty and students." },
  RETURNED: { icon: WarningCircle, tone: "border-amber-500/40 bg-amber-500/5", text: "Returned for revision. Make the changes below and submit again." },
  REJECTED: { icon: WarningCircle, tone: "border-red-500/40 bg-red-500/5", text: "Rejected. Rebuild the timetable and submit a new version." },
  WITHDRAWN: { icon: ArrowCounterClockwise, tone: "border-border bg-muted/40", text: "Withdrawn. Edit it and submit again when ready." },
};

/** The Head of Department's latest timetable submissions with status, reason, reviewer comments, and Withdraw. */
export function SubmissionNotice({ rows }: { rows: SubmissionNoticeRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!rows.length) return null;

  const withdraw = (id: string) => start(async () => {
    const res = await withdrawSubmissionAction(id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Withdrawn. The timetable can be edited again.");
    router.refresh();
  });

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const s = STYLE[r.status];
        return (
          <div key={r.id} role="status" className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", s.tone)}>
            <s.icon className="mt-0.5 size-5 shrink-0" weight="fill" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.title} <span className="font-normal text-muted-foreground">· {r.date}</span></p>
              <p className="text-muted-foreground">{s.text}{r.status === "APPROVED" && r.publishAt ? ` Publishes ${r.publishAt}.` : ""}</p>
              {r.reason && <p className="mt-1"><span className="font-medium">Reason:</span> {r.reason}</p>}
              {r.comments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {r.comments.map((c) => <li key={c.id} className="rounded-md bg-background/70 px-2.5 py-1.5">{c.row && <span className="font-medium">{c.row}: </span>}{c.body}</li>)}
                </ul>
              )}
            </div>
            {r.status === "SUBMITTED" && <Button size="sm" variant="outline" disabled={pending} onClick={() => withdraw(r.id)}><ArrowCounterClockwise className="size-4" /> Withdraw</Button>}
          </div>
        );
      })}
    </div>
  );
}
