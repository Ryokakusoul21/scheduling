"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, ArrowRight, CircleNotch, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { CollectionView, RecordsTable } from "@/components/ux/collection-view";
import type { FixView } from "@/lib/workload/view";
import type { Flag } from "@/lib/workload/optimizer";
import { undoFixAction } from "@/app/(dashboard)/workload/actions";
import { ShortExplanation } from "./short-explanation";

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
const PAGE_SIZE = 10;

/** A compact movement summary; the full audit explanation and original loads stay in Details. */
export function FixLog({ fixes, empty = "No workload fixes yet." }: { fixes: FixView[]; empty?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [undoing, setUndoing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const shown = fixes.filter((f) => (!filter || (filter === "UNDONE" ? !!f.undoneAt : !f.undoneAt)) &&
    [f.label, f.from, f.to].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt) || a.id.localeCompare(b.id));
  const lastPage = Math.max(0, Math.ceil(shown.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = shown.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function undo(id: string) {
    setUndoing(id);
    startTransition(async () => {
      try {
        const res = await undoFixAction(id);
        if (!res.ok) { toast.error(res.error, { duration: 10000 }); return; }
        toast.success("Fix undone. Original faculty restored.");
        router.refresh();
      } finally { setUndoing(null); }
    });
  }

  if (fixes.length === 0) return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1"><MagnifyingGlass aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search fix log" placeholder="Search faculty or class…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} className="pl-9" />
      </div>
      <NativeSelect aria-label="Fix status" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}
        options={[{ value: "", label: "All fixes" }, { value: "APPLIED", label: "Applied" }, { value: "UNDONE", label: "Undone" }]} className="sm:w-36" />
    </div>
    <p role="status" className="text-xs text-muted-foreground">{shown.length} of {fixes.length} recent fixes · newest first</p>
    {visible.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No fixes match your search.</p> :
      <CollectionView storageKey="workload-fixes:view" label="Workload fixes" table={<RecordsTable label="Workload fixes" columns={["Class", "From", "To", "Load", "Status", "Applied", "Details / actions"]} rows={visible.map((f) => ({ id: f.id, cells: [f.label, f.from, f.to, `${f.amount} ${f.measure === "HOURS" ? "hours" : "units"}`, f.undoneAt ? "Undone" : f.mode === "AUTOMATIC" ? "Automatic" : "Approved", when(f.appliedAt), <details key="details" className="text-xs"><summary className="cursor-pointer font-medium text-primary">Details for {f.label}</summary><div className="mt-2 space-y-2"><p>{f.from}: {f.fromBefore} → {f.fromAfter}</p><p>{f.to}: {f.toBefore} → {f.toAfter}</p><p className="whitespace-pre-wrap break-words">Reason: {f.reason}</p><p className="whitespace-pre-wrap break-words">Trigger: {f.trigger}</p>{f.undoneAt && <p>Undone: {when(f.undoneAt)}</p>}{f.canUndo && !f.undoneAt && <Button size="xs" variant="outline" disabled={pending} onClick={() => undo(f.id)}>{pending && undoing === f.id && <CircleNotch className="size-3 animate-spin" />}Undo fix</Button>}</div></details>] }))} />}>
      <ul aria-label="Workload fixes" className="divide-y rounded-lg border">
        {visible.map((f) => {
          const unit = f.measure === "HOURS" ? "hours" : "units";
          return <li key={f.id} className="space-y-2 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1"><p className="line-clamp-1 break-words text-sm font-semibold" title={f.label}>{f.label}</p></div>
              <Badge variant={f.undoneAt ? "outline" : "secondary"}>{f.undoneAt ? "Undone" : f.mode === "AUTOMATIC" ? "Automatic" : "Approved"}</Badge>
            </div>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              <span>{f.from}</span><ArrowRight aria-label="to" className="size-3.5 shrink-0 text-muted-foreground" /><span>{f.to}</span>
              <span className="font-semibold tabular-nums">· {f.amount} {unit}</span>
            </p>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <details className="min-w-0 flex-1 text-xs">
                <summary className="w-fit cursor-pointer rounded-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">Details<span className="sr-only"> for {f.label}</span></summary>
                <div className="mt-3 space-y-3 rounded-lg bg-muted/40 p-3 leading-relaxed">
                  <p className="break-words font-semibold">{f.label}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p><span className="font-medium">{f.from}</span><br /><span className="tabular-nums">{f.fromBefore} → {f.fromAfter} {unit}</span></p>
                    <p><span className="font-medium">{f.to}</span><br /><span className="tabular-nums">{f.toBefore} → {f.toAfter} {unit}</span></p>
                  </div>
                  <p className="whitespace-pre-wrap break-words"><b>Reason: </b>{f.reason}</p>
                  <p className="whitespace-pre-wrap break-words"><b>Trigger: </b>{f.trigger}</p>
                  <p><b>Applied: </b>{when(f.appliedAt)} · {f.mode === "AUTOMATIC" ? "Automatically" : "After approval"}</p>
                  {f.undoneAt && <p><b>Undone: </b>{when(f.undoneAt)}. The transfer was reversed.</p>}
                  {f.canUndo && !f.undoneAt && <Button size="xs" variant="outline" disabled={pending} onClick={() => undo(f.id)}>
                    {pending && undoing === f.id ? <CircleNotch className="size-3 animate-spin" /> : <ArrowCounterClockwise className="size-3" />} Undo fix
                  </Button>}
                </div>
              </details>
              <time dateTime={f.appliedAt} className="text-xs text-muted-foreground">{when(f.appliedAt)}</time>
            </div>
          </li>;
        })}
      </ul></CollectionView>}
    {shown.length > PAGE_SIZE && <nav aria-label="Fix log pages" className="flex items-center justify-between gap-2">
      <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
      <span className="text-xs tabular-nums text-muted-foreground">Page {currentPage + 1} of {lastPage + 1}</span>
      <Button size="sm" variant="outline" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</Button>
    </nav>}
  </div>;
}

const FLAG_LABELS: Record<Flag["kind"], string> = {
  OVERLOADED: "Overloaded",
  UNDERLOADED: "Underloaded",
  UNASSIGNED: "Teacher needed",
  NOT_APPLIED: "Fix not applied",
};

/** Keep the unresolved issue visible while moving its full explanation into Details. */
export function FlagList({ flags, includeUnderloaded = true }: { flags: Flag[]; includeUnderloaded?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const shown = flags.filter((f) => includeUnderloaded || f.kind !== "UNDERLOADED");
  const visible = expanded ? shown : shown.slice(0, 5);
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Nothing needs manual attention.</p>;
  return <div className="space-y-2">
    <CollectionView storageKey="workload-flags:view" label="Workload issues" table={<RecordsTable label="Workload issues" columns={["Faculty / class", "Issue", "Explanation"]} rows={visible.map((f, i) => ({ id: `${f.kind}-${i}`, cells: [f.label, FLAG_LABELS[f.kind], <ShortExplanation key="reason" text={f.explanation} />] }))} />}>
    <ul className="space-y-2">{visible.map((f, i) => <li key={i} className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <WarningCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="min-w-0 space-y-1"><p className="font-semibold">{f.label} <span className="font-normal text-muted-foreground">· {FLAG_LABELS[f.kind]}</span></p><ShortExplanation text={f.explanation} /></div>
    </li>)}</ul>
    </CollectionView>
    {shown.length > 5 && <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${shown.length} issues`}</Button>}
  </div>;
}
