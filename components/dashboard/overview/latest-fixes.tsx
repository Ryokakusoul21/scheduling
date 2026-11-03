"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, CaretDown, CheckCircle, CircleNotch, Lightning, Wrench } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FixView } from "@/lib/workload/view";
import { undoFixAction } from "@/app/(dashboard)/workload/actions";
import { cn } from "@/lib/utils";
import { QuietState } from "./kit";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "5 minutes ago" style label for a timestamp. */
function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return relative.format(Math.round(minutes / 60), "hour");
  return relative.format(Math.round(minutes / 1440), "day");
}

/** Condensed fix timeline: one summary line each, details on demand, undo where allowed. */
export function LatestFixes({ fixes, limit = 5 }: { fixes: FixView[]; limit?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  if (fixes.length === 0) return <QuietState icon={Wrench} title="No fixes yet">Workload fixes appear here as soon as they are applied.</QuietState>;

  function undo(id: string) {
    startTransition(async () => {
      const res = await undoFixAction(id);
      if (!res.ok) {
        setAnnouncement(res.error);
        return void toast.error(res.error, { duration: 10000 });
      }
      const message = "Fix undone. The class is back with its original faculty member, who was notified.";
      setAnnouncement(message);
      toast.success(message);
      router.refresh();
    });
  }

  return (
    <TooltipProvider>
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <ol className="relative space-y-1 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border">
        {fixes.slice(0, limit).map((f) => {
          const unit = f.measure === "HOURS" ? "hours" : "units";
          const expanded = open === f.id;
          const Mode = f.mode === "AUTOMATIC" ? Lightning : CheckCircle;
          return (
            <li key={f.id} className={cn("relative pl-7", f.undoneAt && "opacity-60")}>
              <span className="absolute top-2 left-0 flex size-[15px] items-center justify-center rounded-full border-2 border-card bg-success" aria-hidden />
              <div className="flex items-start gap-2 py-1">
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{f.amount} {unit} of {f.label}</span> moved: {f.from} → {f.to}
                </p>
                <Tooltip>
                  <TooltipTrigger render={<span tabIndex={0} className="mt-0.5 shrink-0 rounded-sm text-muted-foreground" />}>
                    <Mode className="size-4" />
                    <span className="sr-only">{f.mode === "AUTOMATIC" ? "Applied automatically" : "Applied after approval"}</span>
                  </TooltipTrigger>
                  <TooltipContent>{f.mode === "AUTOMATIC" ? "Applied automatically" : "Applied after approval"}</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <time dateTime={f.appliedAt} title={new Date(f.appliedAt).toLocaleString("en-PH")} suppressHydrationWarning>{ago(f.appliedAt)}</time>
                {f.undoneAt && <span>Undone</span>}
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`fix-${f.id}`}
                  onClick={() => setOpen(expanded ? null : f.id)}
                  className="flex items-center gap-1 rounded-sm font-medium text-brand-link"
                >
                  Details <CaretDown className={cn("size-3 transition-transform duration-150", expanded && "rotate-180")} />
                </button>
                {f.canUndo && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={pending} onClick={() => undo(f.id)}>
                    {pending ? <CircleNotch className="size-3.5 animate-spin" /> : <ArrowCounterClockwise className="size-3.5" />} Undo
                  </Button>
                )}
              </div>
              {expanded && (
                <div id={`fix-${f.id}`} className="mt-2 space-y-1 rounded-lg bg-muted/60 p-3 text-[13px]">
                  <p><span className="font-medium">{f.from}</span>: {f.fromBefore} to {f.fromAfter} {unit}</p>
                  <p><span className="font-medium">{f.to}</span>: {f.toBefore} to {f.toAfter} {unit}</p>
                  <p className="text-muted-foreground">{f.reason} Triggered by: {f.trigger}.</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </TooltipProvider>
  );
}
