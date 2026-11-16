"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, ArrowsClockwise, CheckCircle, CircleNotch, Clock, Eye, MagnifyingGlass, Sparkle, WarningCircle, X } from "@phosphor-icons/react/ssr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadBar, LoadStatusLabel } from "@/components/workload/load-bar";
import { NativeSelect } from "@/components/ux/native-select";
import { CollectionView, RecordsTable } from "@/components/ux/collection-view";
import { statusOf } from "@/lib/workload/optimizer";
import type { PreviewLoads, ProposalRowView, ProposalView } from "@/lib/workload/view";
import { approveProposalAction, editProposalRowAction, recheckWorkloadAction, rejectProposalAction } from "@/app/(dashboard)/workload/actions";
import { cn } from "@/lib/utils";

const PROPOSAL_STATUS: Record<string, string> = { PENDING: "Awaiting review", APPLIED: "Applied", REJECTED: "Rejected", SUPERSEDED: "Replaced" };
const ROW_STATUS: Record<ProposalRowView["status"], string> = { PENDING: "Pending", APPROVED: "Awaiting approval", REJECTED: "Rejected", APPLIED: "Applied" };
const isOpen = (r: ProposalRowView) => r.status === "PENDING" || r.status === "APPROVED";
const ready = (p: ProposalView, r: ProposalRowView) => !p.needsRefresh && !r.problem && r.canApprove;
type RowFilter = "all" | "ready" | "attention" | "waiting";

/** Cards and table details share the same scoped review workflow. */
export function ProposalCards({ proposals, unit, preview, history = false, readOnly = false }: { proposals: ProposalView[]; unit: string; preview?: PreviewLoads; history?: boolean; readOnly?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = proposals.map((p) => readOnly ? { ...p, canReview: false, rows: p.rows.map((r) => ({ ...r, canApprove: false, canReject: false, candidates: null })) } : p);
  const open = visible.find((p) => p.id === openId);
  return <>
    <CollectionView storageKey={history ? "workload-proposal-history:view" : "workload-proposals:view"} label="Workload proposals" table={
      <RecordsTable label="Workload proposals" columns={["Department", "Status", "Changes", "Ready to approve", `Load (${unit})`, "Actions"]} rows={visible.map((p) => ({
        id: p.id, cells: [p.department, PROPOSAL_STATUS[p.status] ?? p.status, p.rows.length, p.rows.filter((r) => ready(p, r)).length,
          p.rows.reduce((sum, r) => sum + r.amount, 0),
          <Button key="review" size="sm" variant="outline" onClick={() => setOpenId(p.id)}>{!history && p.canReview ? "Review changes" : "View details"}</Button>],
      }))} />
    }>
      <div className="space-y-4">{visible.map((p) => <ProposalCard key={`${p.id}-${p.version}`} p={p} unit={unit} preview={preview ?? {}} history={history} />)}</div>
    </CollectionView>
    <Dialog open={!!open} onOpenChange={(on) => !on && setOpenId(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl">
      <DialogHeader><DialogTitle>Review reassignments</DialogTitle><DialogDescription>Check recipients and teaching loads before approving a change.</DialogDescription></DialogHeader>
      {open && <ProposalCard key={`${open.id}-${open.version}`} p={open} unit={unit} preview={preview ?? {}} history={history} />}
    </DialogContent></Dialog>
  </>;
}

function ProposalCard({ p, unit, preview, history }: { p: ProposalView; unit: string; preview: PreviewLoads; history: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const reviewing = !history && p.canReview;
  const approvable = p.rows.filter((r) => ready(p, r));
  const rejectable = p.rows.filter((r) => r.canReject);
  const attention = p.rows.filter((r) => isOpen(r) && (r.problem || p.needsRefresh));
  const waiting = p.rows.filter((r) => isOpen(r) && !ready(p, r) && !attention.includes(r));
  const chosen = p.rows.filter((r) => selected.has(r.id));
  const approveIds = chosen.filter((r) => ready(p, r)).map((r) => r.id);
  const rejectIds = chosen.filter((r) => r.canReject).map((r) => r.id);
  const shown = p.rows.filter((r) =>
    (filter === "all" || (filter === "ready" && ready(p, r)) || (filter === "attention" && attention.includes(r)) || (filter === "waiting" && waiting.includes(r))) &&
    (!query.trim() || [r.label, r.from, r.to].some((value) => value.toLowerCase().includes(query.trim().toLowerCase())))
  );
  const selectable = shown.filter((r) => r.canApprove || r.canReject);
  const selectedVisible = selectable.filter((r) => selected.has(r.id)).length;
  const total = p.rows.reduce((sum, r) => sum + r.amount, 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });
  const toggle = (id: string, on: boolean) => setSelected((previous) => { const next = new Set(previous); if (on) next.add(id); else next.delete(id); return next; });

  function report(ok: boolean, message: string) {
    setNotice({ ok, message });
    if (ok) toast.success(message, { duration: 8000 }); else toast.error(message, { duration: 10000 });
  }
  function perform(work: () => Promise<void>) {
    start(async () => { try { await work(); } catch { report(false, "The change could not be saved. Try again, or refresh suggestions to check the latest assignments."); } });
  }
  function approve(ids: string[]) {
    if (!ids.length) return;
    perform(async () => {
      const res = await approveProposalAction({ proposalId: p.id, version: p.version, itemIds: ids });
      if (!res.ok) { report(false, res.error); router.refresh(); return; }
      const { applied, awaiting, summary } = res.data;
      report(true, `${applied} reassignment${applied === 1 ? "" : "s"} applied${awaiting ? `; ${awaiting} awaiting the other department's approval` : ""}.${summary ? ` ${summary}.` : ""}`);
      setSelected(new Set()); router.refresh();
    });
  }
  function reject() {
    if (!rejecting?.length || !reason.trim()) return;
    perform(async () => {
      const res = await rejectProposalAction({ proposalId: p.id, version: p.version, itemIds: rejecting, reason: reason.trim() });
      if (!res.ok) { report(false, res.error); router.refresh(); return; }
      report(true, `${res.data.rejected} reassignment${res.data.rejected === 1 ? "" : "s"} rejected. The classes stay with their current faculty.`);
      setRejecting(null); setReason(""); setSelected(new Set()); router.refresh();
    });
  }
  function change(row: ProposalRowView, toFacultyId: string) {
    if (toFacultyId === row.toFacultyId) return;
    perform(async () => {
      const res = await editProposalRowAction({ proposalId: p.id, version: p.version, itemId: row.id, toFacultyId });
      if (!res.ok) { report(false, res.error); router.refresh(); return; }
      report(true, `Recipient updated to ${row.candidates?.find((c) => c.id === toFacultyId)?.name ?? "the selected faculty member"}. Review and approve the updated change.`);
      router.refresh();
    });
  }
  function refresh() {
    perform(async () => {
      const res = await recheckWorkloadAction();
      if (!res.ok) { report(false, res.error); return; }
      report(true, "Suggestions checked against the latest assignments and availability.");
      setSelected(new Set()); router.refresh();
    });
  }

  return <Card className="gap-0 overflow-hidden py-0">
    <header className="space-y-5 border-b bg-gradient-to-br from-primary/[0.045] via-card to-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary"><Sparkle aria-hidden className="size-5" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold tracking-tight">{p.automatic ? "Suggested reassignments" : "Reassignment proposal"}</h3><Badge variant="outline" className="bg-background">{PROPOSAL_STATUS[p.status] ?? p.status}</Badge></div>
            <p className="mt-1 text-sm text-muted-foreground">{p.department}</p>
            <p className="mt-1 text-xs text-muted-foreground">{history && p.reviewedAt ? "Reviewed" : "Suggested"} {new Date(history && p.reviewedAt ? p.reviewedAt : p.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!history && <Button size="sm" variant="outline" onClick={() => setShowPreview((on) => !on)} aria-pressed={showPreview}><Eye className="size-4" />{showPreview ? "Hide impact" : "Preview impact"}</Button>}
          {reviewing && <Button size="sm" variant="outline" disabled={pending} onClick={refresh}><ArrowsClockwise className={cn("size-4", pending && "animate-spin")} />Refresh suggestions</Button>}
          {reviewing && <Button size="sm" disabled={pending || !approvable.length} onClick={() => approve(approvable.map((r) => r.id))}>{pending ? <CircleNotch className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}Approve ready ({approvable.length})</Button>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[[p.rows.length, "Reassignments", "text-foreground"],
          [history ? p.rows.filter((r) => r.status === "APPLIED").length : approvable.length, history ? "Applied" : "Ready to approve", "text-emerald-700 dark:text-emerald-400"],
          [history ? p.rows.filter((r) => r.status === "REJECTED").length : attention.length, history ? "Rejected" : "Need attention", "text-amber-700 dark:text-amber-400"],
          [total, `${unit} to reassign`, "text-foreground"],
        ].map(([value, label, tone]) => <div key={String(label)} className="rounded-xl border bg-background/80 px-3.5 py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", tone)}>{value}</dd></div>)}
      </dl>
      <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Why these changes were suggested</summary><div className="mt-2 space-y-2 leading-relaxed"><p className="whitespace-pre-wrap break-words">{p.explanation}</p>{p.reviewNote && <p><b>Review note: </b>{p.reviewNote}</p>}</div></details>
    </header>
    <CardContent className="space-y-4 p-4 sm:p-5">
      {notice && <p role={notice.ok ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm", notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-destructive/30 bg-destructive/5 text-destructive")}>{notice.message}</p>}
      {p.needsRefresh && !history && <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><WarningCircle aria-hidden className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">These suggestions need a fresh check</p><p className="mt-1 text-xs leading-relaxed">Assignments or workloads have changed. Refresh suggestions before approving. You can still reject changes you do not want.</p></div></div>}
      {showPreview && <ImpactPreview rows={(chosen.length ? chosen : approvable.length ? approvable : p.rows).filter((r) => isOpen(r) && !r.problem && !p.needsRefresh)} loads={preview} unit={unit} />}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {!history && <div className="flex flex-wrap gap-1" role="group" aria-label="Filter reassignments">{([["all", "All", p.rows.length], ["ready", "Ready", approvable.length], ["attention", "Needs attention", attention.length], ["waiting", "Waiting", waiting.length]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn("inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", filter === value ? "border-primary/20 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted")}>{label}<span className="tabular-nums opacity-75">{count}</span></button>)}</div>}
        <div className="relative min-w-0 lg:w-64"><MagnifyingGlass aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search reassignments" placeholder="Search subject, section or faculty" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div>
      </div>
      {reviewing && <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
        <label className="mr-auto flex min-h-8 items-center gap-2 text-xs font-medium"><Checkbox disabled={pending || !selectable.length} checked={selectable.length > 0 && selectedVisible === selectable.length} indeterminate={selectedVisible > 0 && selectedVisible < selectable.length} onCheckedChange={(on) => setSelected((previous) => { const next = new Set(previous); for (const r of selectable) { if (on) next.add(r.id); else next.delete(r.id); } return next; })} />{chosen.length ? `${chosen.length} selected` : "Select visible"}</label>
        {chosen.length > 0 && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setSelected(new Set())}>Clear</Button>}
        <Button size="sm" variant="outline" disabled={pending || !approveIds.length} onClick={() => approve(approveIds)}>Approve selected ({approveIds.length})</Button>
        <Button size="sm" variant="outline" disabled={pending || !rejectIds.length} onClick={() => setRejecting(rejectIds)}>Reject selected ({rejectIds.length})</Button>
        <Button size="sm" variant="ghost" disabled={pending || !rejectable.length} onClick={() => setRejecting(rejectable.map((r) => r.id))}>Reject all</Button>
      </div>}
      <ul aria-label="Suggested reassignments" className="space-y-3">
        {shown.map((r) => {
          const needsAttention = isOpen(r) && (!!r.problem || p.needsRefresh);
          const canApprove = reviewing && ready(p, r);
          const alternatives = r.candidates?.filter((candidate) => candidate.id !== r.toFacultyId) ?? [];
          return <li key={r.id} className={cn("rounded-xl border bg-card p-4", needsAttention && "border-amber-300/70 dark:border-amber-800")}>
            <div className="flex items-start gap-3">
              {reviewing && (r.canApprove || r.canReject) && <Checkbox aria-label={`Select ${r.label}`} disabled={pending} checked={selected.has(r.id)} onCheckedChange={(on) => toggle(r.id, !!on)} className="mt-1" />}
              <div className="grid min-w-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", needsAttention ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" : canApprove ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground")}>{needsAttention ? <WarningCircle className="size-3" /> : canApprove ? <CheckCircle className="size-3" /> : <Clock className="size-3" />}{needsAttention ? "Needs attention" : canApprove ? "Ready to approve" : r.awaiting ? "Waiting for department" : ROW_STATUS[r.status]}</span><span className="text-xs font-medium tabular-nums text-muted-foreground">{r.amount} {unit}</span></div>
                  <p className="text-sm font-semibold leading-snug">{r.subject || r.label}</p>
                  {r.section && <p className="text-xs text-muted-foreground">{r.section}</p>}
                  {r.edited && <Badge variant="outline" className="text-[10px]">Recipient changed</Badge>}
                  <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">Reason and details</summary><p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{r.reason}</p></details>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
                  <FacultyTransfer label="Current faculty" name={r.from} before={r.fromBefore} after={r.fromAfter} unit={unit} inactive={r.fromInactive} outdated={needsAttention} />
                  <ArrowRight aria-hidden className="mt-9 size-4 text-muted-foreground" />
                  <div className="min-w-0 space-y-2"><FacultyTransfer label="Proposed recipient" name={r.to} before={r.toBefore} after={r.toAfter} unit={unit} receiving outdated={needsAttention} />
                    {reviewing && r.candidates && (alternatives.length ? <details className="text-xs"><summary className="w-fit cursor-pointer rounded-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">Change recipient</summary><div className="mt-2"><NativeSelect aria-label={`Recipient for ${r.label}`} disabled={pending || p.needsRefresh} value={r.toFacultyId} onChange={(event) => change(r, event.target.value)} options={[{ value: r.toFacultyId, label: `${r.to} (current suggestion)` }, ...alternatives.map((candidate) => ({ value: candidate.id, label: `${candidate.name} · ${candidate.after} ${unit} after` }))]} /></div></details> : <p className="text-[11px] leading-relaxed text-muted-foreground">{r.problem ? "No eligible alternative right now. Refresh suggestions after checking assignments or availability." : "The suggested recipient is the only eligible option right now."}</p>)}
                  </div>
                </div>
                {reviewing && <div className="flex flex-wrap items-start gap-2 xl:min-w-28 xl:flex-col xl:justify-center">
                  <Button size="sm" disabled={pending || !canApprove} onClick={() => approve([r.id])} aria-label={`Approve ${r.label}`} className="xl:w-full"><CheckCircle className="size-3.5" />Approve</Button>
                  {r.canReject && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting([r.id])} aria-label={`Reject ${r.label}`} className="text-muted-foreground xl:w-full"><X className="size-3.5" />Reject</Button>}
                </div>}
              </div>
            </div>
            {r.problem && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><WarningCircle aria-hidden className="mt-0.5 size-4 shrink-0" />{r.problem}</p>}
            {r.awaiting && <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Clock aria-hidden className="size-4 shrink-0" />{r.awaiting}</p>}
          </li>;
        })}
      </ul>
      {!shown.length && <div className="rounded-xl border border-dashed py-10 text-center"><MagnifyingGlass aria-hidden className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No matching reassignments</p><p className="mt-1 text-xs text-muted-foreground">Try another status or search term.</p><Button size="sm" variant="ghost" onClick={() => { setFilter("all"); setQuery(""); }}>Show all changes</Button></div>}
      <p className="text-xs text-muted-foreground">{shown.length} of {p.rows.length} changes shown{reviewing ? ". Approval checks current workload, availability and department permissions before applying any change." : "."}</p>
    </CardContent>
    <Dialog open={rejecting !== null} onOpenChange={(on) => !on && !pending && setRejecting(null)}><DialogContent>
      <DialogHeader><DialogTitle>Reject {rejecting?.length ?? 0} reassignment{rejecting?.length === 1 ? "" : "s"}?</DialogTitle><DialogDescription>These classes stay with their current faculty. The next workload check can suggest other recipients.</DialogDescription></DialogHeader>
      <label htmlFor={`reason-${p.id}`} className="text-sm font-medium">Reason <span className="text-muted-foreground">(required)</span></label>
      <Textarea id={`reason-${p.id}`} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Explain why these changes should not be applied." />
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setRejecting(null)}>Cancel</Button><Button variant="destructive" disabled={pending || !reason.trim()} onClick={reject}>{pending && <CircleNotch className="size-4 animate-spin" />}Reject changes</Button></DialogFooter>
    </DialogContent></Dialog>
  </Card>;
}

function FacultyTransfer({ label, name, before, after, unit, inactive = false, receiving = false, outdated = false }: { label: string; name: string; before: number; after: number; unit: string; inactive?: boolean; receiving?: boolean; outdated?: boolean }) {
  return <div className={cn("min-w-0 rounded-lg border p-3", receiving ? "border-primary/10 bg-primary/[0.035]" : "border-transparent bg-muted/50")}>
    <p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium leading-snug">{name}</p>
    {inactive && <span className="mt-1 inline-block text-[10px] font-medium text-amber-700 dark:text-amber-400">Inactive faculty</span>}
    {outdated ? <p className="mt-2 text-[11px] text-muted-foreground">Load needs a fresh check</p> : <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums"><span className="text-muted-foreground">{before}</span><ArrowRight aria-label="changes to" className="size-3 text-muted-foreground" /><span className="font-semibold">{after}</span><span className="text-muted-foreground">{unit}</span></p>}
  </div>;
}

/** Combined before-and-after loads for the selected valid changes. */
function ImpactPreview({ rows, loads, unit }: { rows: ProposalRowView[]; loads: PreviewLoads; unit: string }) {
  const people = useMemo(() => {
    const delta = new Map<string, number>();
    for (const r of rows) { delta.set(r.fromFacultyId, (delta.get(r.fromFacultyId) ?? 0) - r.amount); delta.set(r.toFacultyId, (delta.get(r.toFacultyId) ?? 0) + r.amount); }
    return [...delta].flatMap(([id, change]) => loads[id] ? [{ id, ...loads[id], after: Math.round((loads[id].load + change) * 10) / 10 }] : []);
  }, [rows, loads]);
  return <section aria-label="Workload impact preview" className="overflow-hidden rounded-xl border bg-muted/20">
    <div className="border-b px-4 py-3"><h4 className="text-sm font-semibold">Workload impact</h4><p className="mt-1 text-xs text-muted-foreground">{rows.length} valid change{rows.length === 1 ? "" : "s"} included{rows.some((r) => r.awaiting) ? "; cross-department changes still need both approvals" : ""}.</p></div>
    {!people.length ? <p className="p-4 text-sm text-muted-foreground">No valid changes to preview. Refresh suggestions or choose a ready change.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Faculty member</TableHead><TableHead className="min-w-32">Current load</TableHead><TableHead className="min-w-32">After changes</TableHead><TableHead>Status after</TableHead></TableRow></TableHeader><TableBody>
      {people.map((f) => {
        const before = { load: f.load, minimum: f.minimum, maximum: f.maximum, status: statusOf(f.load, f.minimum, f.maximum) };
        const after = { ...before, load: f.after, status: statusOf(f.after, f.minimum, f.maximum) };
        return <TableRow key={f.id}><TableCell className="font-medium">{f.name}</TableCell><TableCell><LoadBar r={before} /><span className="text-xs tabular-nums text-muted-foreground">{f.load} {unit}</span></TableCell><TableCell><LoadBar r={after} /><span className="text-xs tabular-nums text-muted-foreground">{f.after} {unit}</span></TableCell><TableCell>{f.inactive ? <Badge variant="outline">Inactive faculty</Badge> : <LoadStatusLabel status={after.status} r={after} />}</TableCell></TableRow>;
      })}
    </TableBody></Table></div>}
  </section>;
}
