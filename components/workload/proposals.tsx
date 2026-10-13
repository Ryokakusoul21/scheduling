"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, Sparkle } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ux/action-button";
import type { ProposalView } from "@/lib/workload/view";
import { approveProposalAction, rejectProposalAction } from "@/app/(dashboard)/workload/actions";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = { PENDING: "Awaiting approval", APPLIED: "Approved and applied", REJECTED: "Rejected" };

/** Workload fix proposals with approve and reject controls for those allowed to review them. */
export function ProposalCards({ proposals, unit, compact = false }: { proposals: ProposalView[]; unit: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function review(id: string, approve: boolean) {
    startTransition(async () => {
      if (!approve) {
        const res = await rejectProposalAction(id);
        if (res.ok) toast.success("Proposal rejected. These classes stay where they are."); else toast.error(res.error);
      } else {
        const res = await approveProposalAction(id);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`${res.data.applied} reassignment(s) applied and faculty notified.`);
        res.data.skipped.forEach((s) => toast.warning(s, { duration: 10000 }));
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {proposals.map((p) => (
        <Card key={p.id} className={cn(p.status === "PENDING" && "border-primary/40", compact && "gap-2 py-3")}>
          <CardHeader className={cn("flex-row flex-wrap items-center justify-between gap-2", compact && "px-3")}>
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              {p.automatic ? "Automatic fix proposal" : "Reassignment proposal"}
              <Badge variant={p.status === "PENDING" ? "default" : "outline"}>{STATUS[p.status] ?? p.status}</Badge>
            </CardTitle>
            {p.canReview && (
              <div className="flex gap-2">
                <ActionButton kind="reject" disabled={pending} onClick={() => review(p.id, false)} />
                <Button size="sm" disabled={pending} onClick={() => review(p.id, true)}><CheckCircle className="size-4" /> Approve and apply</Button>
              </div>
            )}
          </CardHeader>
          <CardContent className={cn("space-y-3", compact && "px-3")}>
            {!compact && <p className="text-sm">{p.explanation}</p>}
            {p.narrative && !compact && <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-sm"><Sparkle className="mt-0.5 size-4 shrink-0 text-primary" />{p.narrative}</p>}
            {compact ? (
              <details className="group rounded-lg border">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{p.moves.length} reassignment(s)</span>
                    <span className="text-muted-foreground"> · {p.moves.slice(0, 2).map((m) => `${m.from} to ${m.to}`).join("; ")}{p.moves.length > 2 ? "; …" : ""}</span>
                  </span>
                  <span className="shrink-0 font-medium text-primary group-open:hidden">Show all</span>
                  <span className="hidden shrink-0 font-medium text-primary group-open:inline">Hide</span>
                </summary>
                <div className="max-h-72 overflow-y-auto border-t">
                  <MoveList moves={p.moves} unit={unit} />
                </div>
              </details>
            ) : (
              <MoveList moves={p.moves} unit={unit} className="rounded-lg border" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MoveList({ moves, unit, className }: { moves: ProposalView["moves"]; unit: string; className?: string }) {
  return (
    <ul className={cn("divide-y", className)}>
      {moves.map((m) => (
        <li key={m.key} className="space-y-1 p-2.5 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-medium">{m.label} <Badge variant="secondary">{m.amount} {unit}</Badge></p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs">
            {m.from} ({m.fromBefore} to {m.fromAfter}) <ArrowRight className="size-3" /> {m.to} ({m.toBefore} to {m.toAfter})
          </p>
          <p className="text-xs text-muted-foreground">{m.reason}</p>
        </li>
      ))}
    </ul>
  );
}
