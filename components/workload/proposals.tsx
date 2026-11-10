"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, CircleNotch, Eye, Warning } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadBar, LoadStatusLabel } from "@/components/workload/load-bar";
import { statusOf } from "@/lib/workload/optimizer";
import type { PreviewLoads, ProposalRowView, ProposalView } from "@/lib/workload/view";
import { approveProposalAction, editProposalRowAction, rejectProposalAction } from "@/app/(dashboard)/workload/actions";
import { cn } from "@/lib/utils";

const PROPOSAL_STATUS: Record<string, string> = { PENDING: "Pending", APPLIED: "Approved", REJECTED: "Rejected", SUPERSEDED: "Superseded" };
const ROW_STATUS: Record<ProposalRowView["status"], string> = { PENDING: "Pending", APPROVED: "Approved, waiting", REJECTED: "Rejected", APPLIED: "Applied" };
const isOpen = (r: ProposalRowView) => r.status === "PENDING" || r.status === "APPROVED";

/** Open workload proposals with per-row review, receiver changes, and a before-and-after preview; or read-only history. */
export function ProposalCards({ proposals, unit, preview, history = false }: { proposals: ProposalView[]; unit: string; preview?: PreviewLoads; history?: boolean }) {
  return <div className="space-y-3">{proposals.map((p) => <ProposalCard key={`${p.id}-${p.version}`} p={p} unit={unit} preview={preview ?? {}} history={history} />)}</div>;
}

function ProposalCard({ p, unit, preview, history }: { p: ProposalView; unit: string; preview: PreviewLoads; history: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const actionable = p.rows.filter((r) => r.canApprove || r.canReject);
  const chosen = p.rows.filter((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  function approve(ids?: string[]) {
    start(async () => {
      const res = await approveProposalAction({ proposalId: p.id, version: p.version, itemIds: ids });
      if (!res.ok) { toast.error(res.error, { duration: 10000 }); return router.refresh(); }
      const { applied, awaiting, summary } = res.data;
      toast.success(`${applied} reassignment(s) applied${awaiting ? `, ${awaiting} awaiting the other department` : ""}.${summary ? ` Now: ${summary}.` : ""}`, { duration: 8000 });
      router.refresh();
    });
  }

  function reject() {
    const ids = rejecting;
    start(async () => {
      const res = await rejectProposalAction({ proposalId: p.id, version: p.version, itemIds: ids?.length ? ids : undefined, reason: reason.trim() || undefined });
      if (!res.ok) { toast.error(res.error); return router.refresh(); }
      toast.success(`${res.data.rejected} reassignment(s) rejected. Those classes stay where they are; the next check looks for alternatives.`);
      setRejecting(null);
      setReason("");
      router.refresh();
    });
  }

  function change(row: ProposalRowView, toFacultyId: string) {
    start(async () => {
      const res = await editProposalRowAction({ proposalId: p.id, version: p.version, itemId: row.id, toFacultyId });
      if (!res.ok) { toast.error(res.error); return router.refresh(); }
      const m = res.data;
      toast.success(`${m.label} now goes to ${row.candidates?.find((c) => c.id === toFacultyId)?.name}: ${m.toBefore} to ${m.toAfter} ${unit}. Approve it again to apply.`);
      router.refresh();
    });
  }

  return (
    <Card className={cn(p.status === "PENDING" && "border-primary/40")}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          {p.automatic ? "Automatic fix proposal" : "Reassignment proposal"}
          <Badge variant={p.status === "PENDING" ? "default" : "outline"}>{PROPOSAL_STATUS[p.status] ?? p.status}</Badge>
          <span className="text-xs font-normal text-muted-foreground">{p.department} · {new Date(history && p.reviewedAt ? p.reviewedAt : p.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</span>
        </CardTitle>
        {!history && p.canReview && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}><Eye className="size-4" /> Preview impact</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting([])}>Reject all</Button>
            <Button size="sm" disabled={pending} onClick={() => approve()}>{pending ? <CircleNotch className="size-4 animate-spin" /> : <CheckCircle className="size-4" />} Approve and apply all</Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{p.explanation}</p>
        {p.reviewNote && <p className="rounded-lg bg-muted/60 p-3 text-sm">Reason given: {p.reviewNote}</p>}
        {!history && p.canReview && actionable.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={chosen.length === actionable.length} onCheckedChange={(on) => setSelected(on ? new Set(actionable.map((r) => r.id)) : new Set())} /> Select all</label>
            <Button size="sm" variant="outline" disabled={pending || !chosen.some((r) => r.canApprove)} onClick={() => approve(chosen.map((r) => r.id))}>Approve selected ({chosen.length})</Button>
            <Button size="sm" variant="outline" disabled={pending || !chosen.some((r) => r.canReject)} onClick={() => setRejecting(chosen.map((r) => r.id))}>Reject selected ({chosen.length})</Button>
          </div>
        )}
        {showPreview && <ImpactPreview rows={(chosen.length ? chosen : p.rows).filter(isOpen)} loads={preview} unit={unit} />}
        <ul className="divide-y rounded-lg border">
          {p.rows.map((r) => (
            <li key={r.id} className="flex gap-3 p-2.5 text-sm">
              {!history && (r.canApprove || r.canReject) ? <Checkbox aria-label={`Select ${r.label}`} checked={selected.has(r.id)} onCheckedChange={(on) => toggle(r.id, !!on)} className="mt-1" /> : !history && <span className="w-4 shrink-0" />}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {r.label} <Badge variant="secondary">{r.amount} {unit}</Badge>
                  <Badge variant="outline">{r.awaiting ?? ROW_STATUS[r.status]}</Badge>
                  {r.edited && <Badge variant="outline">Changed by Head of Department</Badge>}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs">
                  {r.from} ({r.fromBefore} to {r.fromAfter}) <ArrowRight className="size-3" aria-label="to" /> {r.to} ({r.toBefore} to {r.toAfter})
                </p>
                <p className="text-xs text-muted-foreground">{r.reason}</p>
                {r.problem && <p className="flex gap-1.5 text-xs text-destructive"><Warning className="mt-0.5 size-3.5 shrink-0" />{r.problem}</p>}
                {!history && r.candidates && (
                  <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Give to someone else
                    <select disabled={pending || !r.candidates.length} value="" onChange={(e) => e.target.value && change(r, e.target.value)} className="rounded-md border bg-background px-2 py-1 text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">{r.candidates.length ? "Choose a faculty member" : "No other faculty member qualifies"}</option>
                      {r.candidates.filter((c) => c.id !== r.toFacultyId).map((c) => <option key={c.id} value={c.id}>{c.name} (load after: {c.after} {unit})</option>)}
                    </select>
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && !pending && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rejecting?.length ? `Reject ${rejecting.length} reassignment(s)?` : "Reject this proposal?"}</DialogTitle>
            <DialogDescription>The classes stay with their current faculty, and the next check suggests something else.</DialogDescription>
          </DialogHeader>
          <label htmlFor={`reason-${p.id}`} className="text-sm font-medium">Reason (required)</label>
          <Textarea id={`reason-${p.id}`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending || !reason.trim()} onClick={reject}>{pending && <CircleNotch className="size-4 animate-spin" />} Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Before-and-after load of every faculty member the chosen rows touch. */
function ImpactPreview({ rows, loads, unit }: { rows: ProposalRowView[]; loads: PreviewLoads; unit: string }) {
  const people = useMemo(() => {
    const delta = new Map<string, number>();
    for (const r of rows) {
      delta.set(r.fromFacultyId, (delta.get(r.fromFacultyId) ?? 0) - r.amount);
      delta.set(r.toFacultyId, (delta.get(r.toFacultyId) ?? 0) + r.amount);
    }
    return [...delta].flatMap(([id, d]) => (loads[id] ? [{ id, ...loads[id], after: Math.round((loads[id].load + d) * 10) / 10 }] : []));
  }, [rows, loads]);
  if (!people.length) return <p className="text-sm text-muted-foreground">Nothing to preview.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader><TableRow><TableHead>Faculty member</TableHead><TableHead className="w-40">Before</TableHead><TableHead className="w-40">After</TableHead><TableHead>Status after</TableHead></TableRow></TableHeader>
        <TableBody>
          {people.map((f) => {
            const before = { load: f.load, minimum: f.minimum, maximum: f.maximum, status: statusOf(f.load, f.minimum, f.maximum) };
            const after = { ...before, load: f.after, status: statusOf(f.after, f.minimum, f.maximum) };
            return (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell><LoadBar r={before} /><span className="text-xs tabular-nums text-muted-foreground">{f.load} {unit}</span></TableCell>
                <TableCell><LoadBar r={after} /><span className="text-xs tabular-nums text-muted-foreground">{f.after} {unit}</span></TableCell>
                <TableCell><LoadStatusLabel status={after.status} r={after} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
