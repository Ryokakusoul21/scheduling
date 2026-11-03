"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CaretDown, CheckCircle, CircleNotch, Sparkle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ProposalView } from "@/lib/workload/view";
import { approveProposalAction, rejectProposalAction } from "@/app/(dashboard)/workload/actions";
import { cn } from "@/lib/utils";
import { QuietState } from "./kit";

/** Pending workload proposals as compact cards with a summary, expandable moves, and approve or reject. */
export function PendingFixes({ proposals, unit }: { proposals: ProposalView[]; unit: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [announcement, setAnnouncement] = useState("");

  function report(ok: boolean, message: string) {
    setAnnouncement(message);
    if (ok) toast.success(message);
    else toast.error(message);
  }

  function approve(p: ProposalView) {
    startTransition(async () => {
      const res = await approveProposalAction({ proposalId: p.id, version: p.version });
      if (!res.ok) { report(false, res.error); return router.refresh(); }
      report(true, `${res.data.applied} reassignment(s) applied and faculty notified${res.data.awaiting ? `; ${res.data.awaiting} await the other department` : ""}.${res.data.summary ? ` Now: ${res.data.summary}.` : ""}`);
      router.refresh();
    });
  }

  function reject() {
    const target = proposals.find((p) => p.id === rejecting);
    if (!target) return;
    startTransition(async () => {
      const res = await rejectProposalAction({ proposalId: target.id, version: target.version, reason: reason.trim() || undefined });
      if (!res.ok) return report(false, res.error);
      report(true, "Proposal rejected. These classes stay where they are.");
      setRejecting(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <p aria-live="polite" className="sr-only">{announcement}</p>
      {proposals.length === 0 ? (
        <QuietState icon={CheckCircle} title="Nothing to approve">New workload proposals appear here.</QuietState>
      ) : (
        <ul className="space-y-3">
          {proposals.map((p) => {
            const faculty = new Set(p.rows.flatMap((m) => [m.from, m.to])).size;
            const expanded = open === p.id;
            return (
              <li key={p.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                    <Sparkle className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {p.rows.length} reassignment{p.rows.length === 1 ? "" : "s"} affecting {faculty} faculty
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {p.automatic ? "Automatic fix proposal" : "Reassignment proposal"} · {new Date(p.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`moves-${p.id}`}
                  onClick={() => setOpen(expanded ? null : p.id)}
                  className="flex items-center gap-1 rounded-sm text-[13px] font-medium text-brand-link"
                >
                  <CaretDown className={cn("size-3.5 transition-transform duration-150", expanded && "rotate-180")} />
                  {expanded ? "Hide reassignments" : "Show reassignments"}
                </button>
                {expanded && (
                  <div id={`moves-${p.id}`} className="space-y-2">
                    <p className="text-[13px] text-muted-foreground">{p.explanation}</p>
                    <ul className="divide-y rounded-lg border">
                      {p.rows.map((m) => (
                        <li key={m.key} className="space-y-0.5 p-3">
                          <p className="flex flex-wrap items-center justify-between gap-2 font-medium">
                            {m.label}
                            <span className="text-xs font-medium tabular-nums text-muted-foreground">{m.amount} {unit}</span>
                          </p>
                          <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                            {m.from} <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" /> {m.to}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {p.canReview && (
                  <div className="flex flex-wrap gap-2">
                    <Button className="h-9 px-3" disabled={pending} onClick={() => approve(p)}>
                      {pending ? <CircleNotch className="size-4 animate-spin" /> : <CheckCircle className="size-4" />} Approve and apply
                    </Button>
                    <Button variant="outline" className="h-9 border-danger/40 px-3 text-danger hover:bg-danger/10 hover:text-danger" disabled={pending} onClick={() => setRejecting(p.id)}>
                      Reject
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this proposal?</DialogTitle>
            <DialogDescription>The classes stay with their current faculty. The reason is saved with the proposal.</DialogDescription>
          </DialogHeader>
          <label htmlFor="reject-reason" className="text-sm font-medium">Reason (optional)</label>
          <Textarea id="reject-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={reject}>
              {pending && <CircleNotch className="size-4 animate-spin" />} Reject proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
