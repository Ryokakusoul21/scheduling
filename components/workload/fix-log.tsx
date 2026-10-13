"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, ArrowRight, CircleNotch, WarningCircle } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FixView } from "@/lib/workload/view";
import type { Flag } from "@/lib/workload/optimizer";
import { undoFixAction } from "@/app/(dashboard)/workload/actions";
import { cn } from "@/lib/utils";

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

/** Every applied workload fix: what moved, from whom to whom, why, both loads before and after, and when; undoable. */
export function FixLog({ fixes, empty = "No workload fixes yet." }: { fixes: FixView[]; empty?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (fixes.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const unit = (f: FixView) => (f.measure === "HOURS" ? "hours" : "units");

  return (
    <ul className="divide-y rounded-lg border">
      {fixes.map((f) => (
        <li key={f.id} className={cn("space-y-1.5 p-3 text-sm", f.undoneAt && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{f.label}</span>
            <Badge variant="secondary">{f.amount} {unit(f)}</Badge>
            <Badge variant="outline">{f.mode === "AUTOMATIC" ? "Applied automatically" : "Applied after approval"}</Badge>
            {f.undoneAt && <Badge variant="outline">Undone {when(f.undoneAt)}</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">{when(f.appliedAt)}</span>
          </div>
          <div className="grid gap-1 text-xs sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <p><span className="font-medium">{f.from}</span>: {f.fromBefore} to {f.fromAfter} {unit(f)}</p>
            <ArrowRight className="hidden size-3.5 text-muted-foreground sm:block" aria-label="moved to" />
            <p><span className="font-medium">{f.to}</span>: {f.toBefore} to {f.toAfter} {unit(f)}</p>
          </div>
          <p className="text-xs text-muted-foreground">{f.reason} Triggered by: {f.trigger}.</p>
          {f.canUndo && (
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await undoFixAction(f.id);
                  if (!res.ok) return void toast.error(res.error, { duration: 10000 });
                  toast.success("Fix undone. The class is back with its original faculty member, who was notified.");
                  router.refresh();
                })
              }
            >
              {pending ? <CircleNotch className="size-3 animate-spin" /> : <ArrowCounterClockwise className="size-3" />} Undo
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

const FLAG_LABELS: Record<Flag["kind"], string> = {
  OVERLOADED: "Still overloaded",
  UNDERLOADED: "Still underloaded",
  UNASSIGNED: "Class without an active teacher",
  NOT_APPLIED: "Fix not applied",
};

/** Problems the automatic check could not fix safely, each with its explanation. */
export function FlagList({ flags, includeUnderloaded = true }: { flags: Flag[]; includeUnderloaded?: boolean }) {
  const shown = flags.filter((f) => includeUnderloaded || f.kind !== "UNDERLOADED");
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Nothing needs manual attention.</p>;
  return (
    <ul className="space-y-2">
      {shown.map((f, i) => (
        <li key={i} className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
          <WarningCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>
            <span className="font-medium">{FLAG_LABELS[f.kind]}: {f.label}.</span> {f.explanation}
          </span>
        </li>
      ))}
    </ul>
  );
}
