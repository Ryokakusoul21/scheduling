"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle, ShieldWarning, Warning, WarningOctagon } from "@phosphor-icons/react/ssr";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import type { Violation } from "@/lib/scheduler/constraints";
import { constraintReportAction } from "@/app/(dashboard)/scheduler/actions";

/** One violation line naming the constraint and the conflicting item. */
function ViolationItem({ v, onJump }: { v: Violation; onJump?: (id: string) => void }) {
  const Icon = v.hard ? WarningOctagon : Warning;
  return (
    <li>
      <button
        type="button"
        disabled={!onJump || !v.entryIds.length}
        onClick={() => onJump?.(v.entryIds[0])}
        className={cn(
          "w-full rounded-lg border p-2.5 text-left text-sm",
          v.hard ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5",
          onJump && "hover:bg-muted"
        )}
      >
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", v.hard ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300")}>
          <Icon className="size-4" weight="fill" /> {v.hard ? "Hard" : "Soft"} · {v.constraintName}
        </span>
        <span className="mt-1 block">{v.message}</span>
      </button>
    </li>
  );
}

/** Promise-based dialog asking whether to save despite soft constraint warnings. */
export function useOverridePrompt() {
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const resolver = useRef<(ok: boolean) => void>(() => {});

  const prompt = useCallback((list: Violation[]) => {
    setViolations(list);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  const close = (ok: boolean) => {
    resolver.current(ok);
    setViolations(null);
  };

  const dialog = (
    <AlertDialog open={!!violations} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Soft constraints would be broken</AlertDialogTitle>
          <AlertDialogDescription>These rules are preferences. You can change the class, or override them and save anyway.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {violations?.map((v, i) => <ViolationItem key={i} v={v} />)}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Change the class</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)}>Override and save</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { prompt, dialog };
}

/** Runs every active constraint over a term and lists hard violations first. */
export function ConstraintReportPanel({ termId, onJump }: { termId: string; onJump: (id: string) => void }) {
  const [report, setReport] = useState<{ termId: string; violations: Violation[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError("");
    const res = await constraintReportAction(termId);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setReport({ termId, violations: res.data });
  }

  const current = report?.termId === termId ? report.violations : null;
  const hard = current?.filter((v) => v.hard).length ?? 0;

  return (
    <div className="space-y-3">
      <Button variant="outline" className="w-full" onClick={run} disabled={loading || !termId}>
        <ShieldWarning className="size-4" /> {loading ? "Checking..." : current ? "Check again" : "Check constraints for this term"}
      </Button>
      {!termId && <p className="text-xs text-muted-foreground">Choose a single term in the filters to run the report.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {current &&
        (current.length === 0 ? (
          <EmptyState icon={CheckCircle} title="All constraints satisfied" description="No hard or soft constraint is broken in this term." className="border-emerald-500/30 bg-emerald-500/5 py-8" />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {hard} hard and {current.length - hard} soft violation{current.length === 1 ? "" : "s"}.
            </p>
            <ul className="space-y-2">
              {current.map((v, i) => <ViolationItem key={i} v={v} onJump={onJump} />)}
            </ul>
          </>
        ))}
    </div>
  );
}
