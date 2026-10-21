"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle, ArrowBendUpLeft, Warning, X } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState } from "@/components/ux/states";
import { levelLabel } from "@/lib/academics/levels";
import { formatLongDate } from "@/lib/calendar";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_COLORS, ACTIVITY_STATUS_LABELS, type ActivityListItem } from "@/lib/activities/status";
import { formatRange } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { reviewActivitiesAction } from "./actions";

type Decision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
const DECISION_LABEL: Record<Decision, string> = { APPROVED: "Approve", REJECTED: "Reject", CHANGES_REQUESTED: "Request changes" };

function when(a: ActivityListItem) {
  const days = a.startDate === a.endDate ? formatLongDate(a.startDate) : `${formatLongDate(a.startDate)} to ${formatLongDate(a.endDate)}`;
  return `${days} · ${a.startMin === null || a.endMin === null ? "Whole day" : formatRange(a.startMin, a.endMin)}`;
}

/** Department submissions grouped by department, with conflicts and single or bulk review. */
export function ApprovalsBoard({ items, departments }: { items: ActivityListItem[]; departments: { value: string; label: string }[] }) {
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState<string>("PENDING");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<{ decision: Decision; ids: string[] } | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const pendingBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) if (a.status === "PENDING" && a.departmentId) m.set(a.departmentId, (m.get(a.departmentId) ?? 0) + 1);
    return m;
  }, [items]);
  const totalPending = [...pendingBy.values()].reduce((a, b) => a + b, 0);
  const shown = items.filter((a) => (!department || a.departmentId === department) && (!status || a.status === status));
  const reviewable = shown.filter((a) => a.status !== "APPROVED");
  const chosen = reviewable.filter((a) => selected.has(a.id)).map((a) => a.id);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function decide(decision: Decision, ids: string[], reason?: string) {
    startTransition(async () => {
      const res = await reviewActivitiesAction({ ids, decision, note: reason });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.count} activit${res.count === 1 ? "y" : "ies"} ${decision === "APPROVED" ? "approved" : decision === "REJECTED" ? "rejected" : "returned for changes"}. The submitters were notified.`);
      setSelected(new Set());
      setAsking(null);
      setNote("");
    });
  }

  // Approval needs no reason; rejection and change requests ask for one first.
  const start = (decision: Decision, ids: string[]) => (decision === "APPROVED" ? decide(decision, ids) : setAsking({ decision, ids }));

  const tabs = [{ value: "", label: "All departments", count: totalPending }, ...departments.map((d) => ({ ...d, count: pendingBy.get(d.value) ?? 0 }))];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Departments">
        {tabs.map((t) => (
          <button
            key={t.value || "all"}
            role="tab"
            aria-selected={department === t.value}
            onClick={() => { setDepartment(t.value); setSelected(new Set()); }}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", department === t.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {t.label}
            {t.count > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setSelected(new Set()); }} placeholder="Every status" options={ACTIVITY_STATUSES.map((s) => ({ value: s, label: ACTIVITY_STATUS_LABELS[s] }))} className="w-48" />
        {reviewable.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={chosen.length === reviewable.length} onCheckedChange={(c) => setSelected(new Set(c ? reviewable.map((a) => a.id) : []))} aria-label="Select all shown" />
            Select all ({reviewable.length})
          </label>
        )}
        {chosen.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            <span className="self-center text-sm text-muted-foreground">{chosen.length} selected</span>
            <Button size="sm" disabled={pending} onClick={() => start("APPROVED", chosen)}><CheckCircle className="size-4" /> Approve</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => start("CHANGES_REQUESTED", chosen)}><ArrowBendUpLeft className="size-4" /> Request changes</Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => start("REJECTED", chosen)}><X className="size-4" /> Reject</Button>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nothing to review" description="Activities submitted by Heads of Department appear here until they are reviewed." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((a) => (
            <Card key={a.id} className={cn(selected.has(a.id) && "ring-2 ring-primary")}>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  {a.status !== "APPROVED" && <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Select ${a.title}`} className="mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.department} · {a.level ? levelLabel(a.level) : "All levels"}</p>
                  </div>
                  <Badge variant="outline" className={ACTIVITY_STATUS_COLORS[a.status]}>{ACTIVITY_STATUS_LABELS[a.status]}</Badge>
                </div>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-muted-foreground">Submitted by</dt><dd>{a.submittedBy}, {new Date(a.submittedAt).toLocaleDateString("en-PH", { dateStyle: "medium" })}</dd>
                  <dt className="text-muted-foreground">Date and time</dt><dd>{when(a)}</dd>
                  <dt className="text-muted-foreground">Location</dt><dd>{a.location || "Not set"}</dd>
                  <dt className="text-muted-foreground">Participants</dt><dd>{a.participants || "Not set"}</dd>
                  {a.description && (<><dt className="text-muted-foreground">Description</dt><dd>{a.description}</dd></>)}
                  {a.reviewNote && (<><dt className="text-muted-foreground">Review note</dt><dd>{a.reviewNote}</dd></>)}
                </dl>
                {a.conflicts.length > 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                    <p className="mb-1 flex items-center gap-1 font-medium"><Warning className="size-3.5 text-amber-600" aria-hidden /> {a.conflicts.length} conflict(s) detected</p>
                    <ul className="max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-muted-foreground">
                      {a.conflicts.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">No conflicts with rooms, classes, or examinations.</p>
                )}
                {a.status !== "APPROVED" && (
                  <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                    <Button size="sm" variant="destructive" disabled={pending} onClick={() => start("REJECTED", [a.id])}>Reject</Button>
                    {a.status !== "CHANGES_REQUESTED" && <Button size="sm" variant="outline" disabled={pending} onClick={() => start("CHANGES_REQUESTED", [a.id])}>Request changes</Button>}
                    <Button size="sm" disabled={pending} onClick={() => start("APPROVED", [a.id])}>Approve</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!asking} onOpenChange={(o) => !o && setAsking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{asking && DECISION_LABEL[asking.decision]} {asking?.ids.length === 1 ? "this activity" : `${asking?.ids.length} activities`}</DialogTitle>
            <DialogDescription>
              {asking?.decision === "REJECTED" ? "Give the reason for rejecting. The submitter is notified." : "Describe the changes needed. The submitter can edit and resubmit."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder={asking?.decision === "REJECTED" ? "For example: The gymnasium is reserved for the intramurals that week." : "For example: Move the start time after 3:00 PM to avoid classes."} aria-label="Reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(null)}>Cancel</Button>
            <Button variant={asking?.decision === "REJECTED" ? "destructive" : "default"} disabled={pending || !note.trim()} onClick={() => asking && decide(asking.decision, asking.ids, note)}>
              {asking && DECISION_LABEL[asking.decision]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
