"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle, Clock, ListChecks, MagnifyingGlass, Plus, XCircle } from "@phosphor-icons/react/ssr";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NativeSelect } from "@/components/ux/native-select";
import { StatCard } from "@/components/ux/stat-card";
import { PageHeader } from "@/components/ux/states";
import { REQUEST_TYPES, STATUS_FILTERS, STATUS_LABELS, TYPE_LABELS, statusGroup, type RequestFormInput, type RequestRow, type StatusFilter } from "@/lib/requests/rules";
import { cancelRequestAction, createRequestAction, reviewRequestAction, updateRequestAction } from "./actions";
import { RequestDrawer } from "./request-drawer";
import { RequestFormModal, type Option } from "./request-form-modal";
import { RequestsEmpty } from "./requests-empty";
import { RequestCards, RequestsTable, type Sort, type SortKey } from "./requests-table";
import { ReviewDialog } from "./review-dialog";
import type { ScheduleOption } from "./schedule-combobox";

const PAGE_SIZES = [10, 25, 50];

const sortValue = (r: RequestRow, key: SortKey) =>
  key === "type" ? TYPE_LABELS[r.type] ?? r.type : key === "schedule" ? r.scheduleLabel : key === "requestedBy" ? r.requestedByName : key === "status" ? STATUS_LABELS[r.status] ?? r.status : r.createdAt;

export function RequestsManager({ description, requests, schedules, rooms, faculty, me }: {
  description: string; requests: RequestRow[]; schedules: ScheduleOption[]; rooms: Option[]; faculty: Option[]; me: string;
}) {
  const [rows, addRow] = useOptimistic(requests, (current: RequestRow[], row: RequestRow) => [row, ...current]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [type, setType] = useState("ALL");
  const [sort, setSort] = useState<Sort>({ key: "createdAt", dir: "desc" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing: RequestRow | null } | null>(null);
  const [review, setReview] = useState<{ row: RequestRow; status: "APPROVED" | "REJECTED" } | null>(null);
  const [cancelling, setCancelling] = useState<RequestRow | null>(null);
  const [busy, start] = useTransition();

  const counts = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    approved: rows.filter((r) => statusGroup(r.status) === "APPROVED").length,
    rejected: rows.filter((r) => r.status === "REJECTED").length,
  }), [rows]);

  const typeOptions = [...new Set([...REQUEST_TYPES.map((t) => t.value as string), ...rows.map((r) => r.type)])];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (status === "ALL" || statusGroup(r.status) === status) && (type === "ALL" || r.type === type) &&
        (!q || `${r.scheduleLabel} ${r.requestedByName} ${r.reason} ${TYPE_LABELS[r.type] ?? ""}`.toLowerCase().includes(q)))
      .sort((a, b) => (sortValue(a, sort.key) < sortValue(b, sort.key) ? -1 : sortValue(a, sort.key) > sortValue(b, sort.key) ? 1 : 0) * (sort.dir === "asc" ? 1 : -1));
  }, [rows, query, status, type, sort]);

  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageRows = shown.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const open = rows.find((r) => r.id === openId) ?? null;
  const filtered = query !== "" || status !== "ALL" || type !== "ALL";
  const clear = () => { setQuery(""); setStatus("ALL"); setType("ALL"); setPage(0); };
  const toggleStatus = (s: StatusFilter) => { setStatus(status === s ? "ALL" : s); setPage(0); };

  /** Returns an error message or null. The optimistic row shows at once and is replaced by the saved one. */
  async function submit(input: RequestFormInput, editingId: string | null) {
    if (editingId) {
      const res = await updateRequestAction(editingId, input);
      if (!res.ok) return res.error;
      toast.success("Request updated.");
      return null;
    }
    const chosen = schedules.find((s) => s.id === input.scheduleId);
    const now = new Date().toISOString();
    addRow({
      id: `pending-${now}`, type: input.type, status: "PENDING", reason: input.reason.trim(), reviewNote: "", requestedByName: me, reviewedByName: "",
      scheduleLabel: chosen ? `${chosen.code} · ${chosen.section}` : "Not applicable", scheduleId: input.scheduleId || null, createdAt: now, updatedAt: now,
      current: null, requested: null, form: null, mine: true, canReview: false, canEdit: false, canCancel: false, workloadWarning: null,
    });
    const res = await createRequestAction(input);
    if (!res.ok) return res.error;
    toast.success("Request submitted.");
    return null;
  }

  async function decide(note: string) {
    if (!review) return null;
    const res = await reviewRequestAction(review.row.id, review.status, note || undefined);
    if (!res.ok) return res.error;
    toast.success(`Request ${review.status === "APPROVED" ? "approved" : "rejected"}. The requester was notified.`);
    setReview(null);
    setOpenId(null);
    return null;
  }

  function confirmCancel() {
    if (!cancelling) return;
    const row = cancelling;
    start(async () => {
      const res = await cancelRequestAction(row.id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Request cancelled.");
      setCancelling(null);
      setOpenId(null);
    });
  }

  const handlers = {
    onOpen: (r: RequestRow) => setOpenId(r.id),
    onEdit: (r: RequestRow) => { setOpenId(null); setForm({ editing: r }); },
    onCancel: (r: RequestRow) => setCancelling(r),
    onReview: (r: RequestRow, s: "APPROVED" | "REJECTED") => setReview({ row: r, status: s }),
  };
  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const create = <Button size="lg" onClick={() => setForm({ editing: null })}><Plus className="size-4" /> New request</Button>;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <PageHeader title="Schedule Requests" description={description} actions={create} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total requests" value={counts.total} icon={ListChecks} active={status === "ALL"} onClick={() => { setStatus("ALL"); setPage(0); }} />
          <StatCard label="Pending" value={counts.pending} icon={Clock} tone="amber" active={status === "PENDING"} onClick={() => toggleStatus("PENDING")} />
          <StatCard label="Approved" value={counts.approved} icon={CheckCircle} tone="green" active={status === "APPROVED"} onClick={() => toggleStatus("APPROVED")} />
          <StatCard label="Rejected" value={counts.rejected} icon={XCircle} tone="red" active={status === "REJECTED"} onClick={() => toggleStatus("REJECTED")} />
        </div>

        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Search requests by class, requester, or details</span>
              <MagnifyingGlass className="absolute left-2.5 top-3 size-4 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search class, requester, or details" className="h-10 pl-8 md:text-sm" />
            </label>
            <NativeSelect aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(0); }} options={STATUS_FILTERS.map((s) => ({ value: s, label: s === "ALL" ? "All statuses" : STATUS_LABELS[s] }))} className="[&_select]:h-10" />
            <NativeSelect aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} options={[{ value: "ALL", label: "All types" }, ...typeOptions.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))]} className="[&_select]:h-10" />
            {filtered && <Button variant="ghost" onClick={clear}>Clear filters</Button>}
            <p aria-live="polite" className="ml-auto text-sm text-muted-foreground">{shown.length} of {rows.length} requests</p>
          </div>

          {rows.length === 0 ? (
            <RequestsEmpty title="No requests yet" description="Ask for a new class, or a change to the room, time or teacher of an existing one." action={<Button size="lg" onClick={() => setForm({ editing: null })}><Plus className="size-4" /> Create your first request</Button>} />
          ) : shown.length === 0 ? (
            <RequestsEmpty title="No requests match these filters" description="Try a different search, status or type." action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
          ) : (
            <>
              <div className="hidden md:block"><RequestsTable rows={pageRows} sort={sort} onSort={onSort} {...handlers} /></div>
              <div className="md:hidden"><RequestCards rows={pageRows} {...handlers} /></div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
                <p className="text-muted-foreground">Showing {pageIndex * pageSize + 1}–{Math.min(shown.length, (pageIndex + 1) * pageSize)} of {shown.length}</p>
                <div className="flex items-center gap-2">
                  <NativeSelect aria-label="Rows per page" value={String(pageSize)} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} />
                  <Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>Previous</Button>
                  <span className="tabular-nums">{pageIndex + 1} / {pageCount}</span>
                  <Button variant="outline" size="sm" disabled={pageIndex >= pageCount - 1} onClick={() => setPage(pageIndex + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </Card>

        {form && <RequestFormModal key={form.editing?.id ?? "new"} open editing={form.editing} onOpenChange={(o) => !o && setForm(null)} schedules={schedules} rooms={rooms} faculty={faculty} onSubmit={submit} />}
        {open && <RequestDrawer row={open} onClose={() => setOpenId(null)} onEdit={() => handlers.onEdit(open)} onCancel={() => setCancelling(open)} onReview={(s) => setReview({ row: open, status: s })} />}
        {review && <ReviewDialog row={review.row} status={review.status} onClose={() => setReview(null)} onSubmit={decide} />}

        <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && !busy && setCancelling(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
              <AlertDialogDescription>{cancelling ? `${TYPE_LABELS[cancelling.type] ?? cancelling.type} for ${cancelling.scheduleLabel}. ` : ""}Reviewers will be told it was withdrawn. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep request</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={busy} onClick={confirmCancel}>{busy ? "Cancelling..." : "Cancel request"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
