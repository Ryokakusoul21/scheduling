"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowsClockwise, CaretDown, CheckCircle, CircleNotch, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CollectionView, RecordsTable } from "@/components/ux/collection-view";
import { NativeSelect } from "@/components/ux/native-select";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import { levelLabel } from "@/lib/academics/levels";
import { LOAD_STATUS, NEAR_LIMIT, LoadBar, LoadStatusLabel } from "@/components/workload/load-bar";
import { FixLog, FlagList } from "@/components/workload/fix-log";
import { ProposalCards } from "@/components/workload/proposals";
import type { FacultyLoadView, FixView, PreviewLoads, ProposalView } from "@/lib/workload/view";
import type { Flag } from "@/lib/workload/optimizer";
import { cn } from "@/lib/utils";
import { recheckWorkloadAction } from "./actions";

type Summary = { overloaded: number; underloaded: number; balanced: number; nearLimit: number; score: number };

export function WorkloadBoard(props: {
  staff: boolean;
  canReview: boolean;
  measure: "HOURS" | "UNITS";
  tolerance: number;
  status: { checkedAt: string; trigger: string } | null;
  summary: Summary;
  flags: Flag[];
  rows: FacultyLoadView[];
  proposals: ProposalView[];
  history: ProposalView[];
  preview: PreviewLoads;
  fixes: FixView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [sort, setSort] = useState("attention");
  const [tab, setTab] = useState("faculty");
  const [open, setOpen] = useState<string | null>(null);
  const unit = props.measure === "HOURS" ? "hours" : "units";
  const departments = [...new Set(props.rows.map((r) => r.department))].sort();
  const rows = useMemo(() => {
    const priority = (r: FacultyLoadView) => r.status === "OVERLOADED" ? 3 : r.status === "UNDERLOADED" ? 2 : r.nearLimit ? 1 : 0;
    const needle = query.trim().toLocaleLowerCase();
    return props.rows.filter((r) => (!filter || (filter === "NEAR_LIMIT" ? r.nearLimit : r.status === filter)) &&
      (!department || r.department === department) && (!needle || `${r.name} ${r.department}`.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => (sort === "load" ? b.load - a.load : sort === "attention" ? priority(b) - priority(a) : 0) || a.name.localeCompare(b.name));
  }, [props.rows, filter, department, query, sort]);
  const approval = (r: FacultyLoadView) => r.pendingChange === null ? "No pending change" : `Pending: ${r.pendingChange > 0 ? "+" : ""}${r.pendingChange} ${unit}`;
  const pendingChanges = props.proposals.reduce((sum, p) => sum + p.rows.filter((r) => r.status === "PENDING" || r.status === "APPROVED").length, 0);
  const canSeeLog = props.canReview || !props.staff;
  const s = props.summary;

  function recheck() {
    startTransition(async () => {
      const res = await recheckWorkloadAction();
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.data.proposed ? "New fixes are ready for review." : "Check complete. No new fix needed.");
      if (res.data.flags) toast.warning(`${res.data.flags} item(s) need manual review.`);
      router.refresh();
    });
  }

  function focusStatus(status: string) { setFilter(filter === status ? "" : status); setTab("faculty"); }
  function clearFilters() { setFilter(""); setQuery(""); setDepartment(""); }
  const toggle = (id: string) => setOpen(open === id ? null : id);

  return <div className="space-y-4">
    {props.staff && <>
      <section aria-label="Workload overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["Overloaded", s.overloaded, "OVERLOADED", "Above maximum"],
          ["Underloaded", s.underloaded, "UNDERLOADED", "Below minimum"],
          ["Balanced", s.balanced, "BALANCED", s.nearLimit ? `${s.nearLimit} near limit` : "Within allowed range"],
        ] as const).map(([label, value, status, note]) => {
          const Icon = LOAD_STATUS[status].icon;
          return <button key={status} type="button" onClick={() => focusStatus(status)} aria-pressed={filter === status}
            className={cn("rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === status && "border-primary ring-1 ring-primary")}>
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon aria-hidden className={cn("size-4", LOAD_STATUS[status].text)} /></div>
            <p className={cn("mt-2 text-3xl font-bold tabular-nums", LOAD_STATUS[status].text)}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </button>;
        })}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <p className="text-xs font-medium text-muted-foreground">Balance score</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{s.score}<span className="text-sm font-normal text-muted-foreground"> / 100</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{props.tolerance ? `Within limits and ±${props.tolerance} ${unit} of average` : "Share within allowed range"}</p>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {pendingChanges || props.flags.length ? <WarningCircle aria-hidden className="size-5 shrink-0 text-amber-600" /> : <CheckCircle aria-hidden className="size-5 shrink-0 text-emerald-600" />}
          <div><p className="text-sm font-semibold">{pendingChanges ? `${pendingChanges} change${pendingChanges === 1 ? "" : "s"} awaiting approval` : "No changes awaiting approval"}</p>
            <p className="text-xs text-muted-foreground">{props.flags.length ? `${props.flags.length} item${props.flags.length === 1 ? " needs" : "s need"} review · ` : ""}Changes require department approval.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(pendingChanges > 0 || props.flags.length > 0) && <Button size="sm" variant="outline" onClick={() => setTab("review")}>{props.canReview ? "Review changes" : "View changes"}</Button>}
          {props.canReview && <Button size="sm" variant="outline" onClick={recheck} disabled={pending}>{pending ? <CircleNotch className="size-4 animate-spin" /> : <ArrowsClockwise className="size-4" />} Recheck now</Button>}
        </div>
        {props.status && <details className="w-full text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">Last checked {new Date(props.status.checkedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</summary><p className="mt-2 break-words">Trigger: {props.status.trigger}</p></details>}
      </div>
    </>}

    <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="gap-4">
      <TabsList aria-label="Workload views" className="grid w-full grid-cols-2 gap-1 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit print:hidden">
        <TabsTrigger value="faculty" className="px-3 py-2">{props.staff ? "Faculty" : "My load"}{props.staff && <span className="text-xs tabular-nums text-muted-foreground">{props.rows.length}</span>}</TabsTrigger>
        {(props.staff || props.proposals.length > 0) && <TabsTrigger value="review" className="px-3 py-2">{props.staff ? "Review" : "Pending changes"}{pendingChanges > 0 && <Badge variant="secondary">{pendingChanges}</Badge>}</TabsTrigger>}
        {canSeeLog && <TabsTrigger value="fixes" className="px-3 py-2">{props.staff ? "Fix log" : "Changes"}{props.fixes.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">{props.fixes.length}</span>}</TabsTrigger>}
        {props.canReview && <TabsTrigger value="history" className="px-3 py-2">Proposal history</TabsTrigger>}
      </TabsList>

      <TabsContent value="faculty" className="space-y-3">
        {!props.staff ? <MyLoad r={props.rows[0]} unit={unit} approval={approval} /> : <Card className="print-area">
          <CardHeader className="gap-3 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="font-bold">Faculty teaching load</CardTitle><p className="mt-1 text-xs text-muted-foreground">Select a faculty member to view classes.</p></div>
              <ExportButtons filename="faculty-workload" rows={rows} columns={[
                { header: "Faculty member", value: (r) => r.name }, { header: "Department", value: (r) => r.department },
                { header: `Load (${unit})`, value: (r) => r.load }, { header: "Units", value: (r) => r.units },
                { header: `Minimum (${unit})`, value: (r) => r.minimum }, { header: `Maximum (${unit})`, value: (r) => r.maximum },
                { header: "Status", value: (r) => r.nearLimit ? NEAR_LIMIT.label : LOAD_STATUS[r.status].label },
                { header: "Approval status", value: approval }, { header: "Classes", value: (r) => r.classes.length },
              ]} />
            </div>
            <div className="flex flex-col gap-2 xl:flex-row">
              <div className="relative min-w-0 flex-1"><MagnifyingGlass aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search faculty" placeholder="Search faculty or department…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" /></div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <NativeSelect aria-label="Load status" value={filter} onChange={(e) => setFilter(e.target.value)} options={[{ value: "", label: "All statuses" }, ...Object.entries(LOAD_STATUS).map(([value, status]) => ({ value, label: status.label })), { value: "NEAR_LIMIT", label: NEAR_LIMIT.label }]} className="sm:w-40" />
                {departments.length > 1 && <NativeSelect aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]} className="sm:w-44" />}
                <NativeSelect aria-label="Sort faculty" value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: "attention", label: "Needs attention first" }, { value: "name", label: "Name A–Z" }, { value: "load", label: "Highest load" }]} className="sm:w-44" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2"><p role="status" className="text-xs text-muted-foreground">{rows.length} of {props.rows.length} faculty</p>{(filter || query || department) && <Button size="xs" variant="ghost" onClick={clearFilters}>Clear filters</Button>}</div>
          </CardHeader>
          <CardContent>
            <PrintHeader title="Faculty Workload Report" />
            {rows.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{props.rows.length ? "No faculty match these filters." : "No faculty in your scope."}</p> : <>
              <CollectionView storageKey="workload-faculty:view" label="Faculty loads" defaultView="table" table={<div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead>Faculty member</TableHead><TableHead className="min-w-40">Teaching load</TableHead><TableHead>Allowed range</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Classes</TableHead></TableRow></TableHeader>
                  <TableBody>{rows.map((r) => [
                    <TableRow key={r.facultyId}>
                      <TableCell><button type="button" onClick={() => toggle(r.facultyId)} aria-expanded={open === r.facultyId} aria-controls={open === r.facultyId ? `classes-desktop-${r.facultyId}` : undefined} className="flex items-center gap-2 rounded-sm text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"><CaretDown aria-hidden className={cn("size-3.5 shrink-0 transition-transform", open === r.facultyId && "rotate-180")} /><span><span className="block font-semibold">{r.name}</span><span className="text-xs text-muted-foreground">{r.department}</span></span></button></TableCell>
                      <TableCell><p className="mb-2 font-semibold tabular-nums">{r.load} <span className="text-xs font-normal text-muted-foreground">{unit}</span></p><LoadBar r={r} />{props.measure === "HOURS" && <p className="mt-1 text-xs text-muted-foreground">{r.units} units</p>}{r.byLevel.length > 1 && <p className="mt-1 text-xs text-muted-foreground">{r.byLevel.map((x) => `${levelLabel(x.level)} ${x.load}`).join(" · ")}</p>}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">{r.minimum}–{r.maximum} {unit}</TableCell>
                      <TableCell><LoadStatusLabel status={r.status} r={r} />{r.pendingChange !== null && <p className="mt-1 text-xs text-muted-foreground">{approval(r)}</p>}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.classes.length}</TableCell>
                    </TableRow>,
                    open === r.facultyId && <TableRow key={`${r.facultyId}-classes`}><TableCell colSpan={5} className="bg-muted/30"><div id={`classes-desktop-${r.facultyId}`}><FacultyClasses r={r} unit={unit} /></div></TableCell></TableRow>,
                  ])}</TableBody>
                </Table>
              </div>}>
              <ul aria-label="Faculty loads" className="grid gap-3 lg:grid-cols-2">{rows.map((r) => <li key={r.facultyId} className="space-y-3 rounded-lg border p-3">
                <button type="button" onClick={() => toggle(r.facultyId)} aria-expanded={open === r.facultyId} aria-controls={open === r.facultyId ? `classes-mobile-${r.facultyId}` : undefined} className="flex w-full items-center justify-between gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0"><span className="block font-semibold">{r.name}</span><span className="text-xs text-muted-foreground">{r.department}</span></span><CaretDown aria-hidden className={cn("size-4 shrink-0", open === r.facultyId && "rotate-180")} /></button>
                <div className="flex items-center justify-between gap-2"><p className="font-semibold tabular-nums">{r.load} {unit}</p><LoadStatusLabel status={r.status} r={r} /></div><LoadBar r={r} />
                <p className="text-xs text-muted-foreground">{r.byLevel.length > 1 && `${r.byLevel.map((x) => `${levelLabel(x.level)} ${x.load}`).join(" · ")} · `}Allowed {r.minimum}–{r.maximum} {unit} · {r.classes.length} classes{props.measure === "HOURS" ? ` · ${r.units} units` : ""}</p>
                {r.pendingChange !== null && <p className="text-xs font-medium text-primary">{approval(r)}</p>}
                {open === r.facultyId && <div id={`classes-mobile-${r.facultyId}`} className="border-t pt-3"><FacultyClasses r={r} unit={unit} /></div>}
              </li>)}</ul>
              </CollectionView>
            </>}
          </CardContent>
        </Card>}
      </TabsContent>

      <TabsContent value="review" className="space-y-4">
        {props.canReview && props.flags.length > 0 && <Card><CardHeader><CardTitle className="font-bold">Needs attention <span className="font-normal text-muted-foreground">· {props.flags.length}</span></CardTitle></CardHeader><CardContent><FlagList flags={props.flags} /></CardContent></Card>}
        {props.proposals.length ? <ProposalCards proposals={props.proposals} unit={unit} preview={props.preview} readOnly={!props.canReview} /> : <div className="rounded-xl border border-dashed bg-card p-8 text-center"><CheckCircle aria-hidden className="mx-auto mb-2 size-7 text-emerald-600" /><p className="font-semibold">No changes awaiting approval</p><p className="mt-1 text-xs text-muted-foreground">New proposals appear here after a workload check.</p></div>}
      </TabsContent>

      {canSeeLog && <TabsContent value="fixes"><Card><CardHeader><CardTitle className="font-bold">{props.staff ? "Workload fix log" : "Changes to my load"}</CardTitle><p className="text-xs text-muted-foreground">Recent transfers. Open Details for full reasons and before/after loads.</p></CardHeader><CardContent><FixLog fixes={props.fixes} empty={props.staff ? "No workload fixes yet." : "No workload changes yet."} /></CardContent></Card></TabsContent>}
      {props.canReview && <TabsContent value="history">{props.history.length ? <ProposalCards proposals={props.history} unit={unit} history /> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No past proposals yet.</p>}</TabsContent>}
    </Tabs>
  </div>;
}

function FacultyClasses({ r, unit }: { r: FacultyLoadView; unit: string }) {
  if (!r.classes.length) return <p className="text-sm text-muted-foreground">No classes in the active terms.</p>;
  return <ul className="space-y-2 py-2">{r.classes.map((c) => <li key={c.label} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-sm"><div className="min-w-0"><p className="font-medium">{c.label}</p><p className="text-xs text-muted-foreground">{c.when}</p></div><span className="text-xs tabular-nums">{c.amount} {unit}</span></li>)}</ul>;
}

/** Faculty view: one headline load card, then each class as a card with its meeting times as chips. */
function MyLoad({ r, unit, approval }: { r: FacultyLoadView | undefined; unit: string; approval: (r: FacultyLoadView) => string }) {
  if (!r) return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No faculty record found for your account.</CardContent></Card>;
  const stats = [["Classes", r.classes.length], ["Units", r.units], ["Minimum", `${r.minimum} ${unit}`], ["Maximum", `${r.maximum} ${unit}`]];
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8">
            <p className="flex items-baseline gap-1.5"><span className="text-5xl font-semibold tabular-nums">{r.load}</span><span className="text-muted-foreground">of {r.maximum} {unit} a week</span></p>
            <div className="space-y-2">
              <LoadBar r={r} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><LoadStatusLabel status={r.status} r={r} />{r.pendingChange !== null && <span className="text-muted-foreground">{approval(r)}</span>}</div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map(([label, value]) => <div key={label} className="rounded-lg bg-muted/50 px-3 py-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-base font-semibold tabular-nums">{value}</dd></div>)}
          </dl>
        </CardContent>
      </Card>

      <section aria-label="My classes" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <h2 className="text-base font-semibold">My classes</h2>
          <ExportButtons
            filename="my-teaching-load"
            rows={r.classes}
            columns={[{ header: "Class", value: (c) => c.label }, { header: `Load (${unit})`, value: (c) => c.amount }, { header: "Schedule", value: (c) => c.when }]}
          />
        </div>
        {r.classes.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No classes in the active terms.</p> : (
          <CollectionView storageKey="workload-classes:view" label="My classes" table={<RecordsTable label="My classes" columns={["Class", `Load (${unit})`, "Schedule"]} rows={r.classes.map((c) => ({ id: c.label, cells: [c.label, c.amount, c.when] }))} />}>
          <ul className="grid gap-3 md:grid-cols-2">
            {r.classes.map((c) => {
              const [subject, ...section] = c.label.split(", ");
              return (
                <li key={c.label} className="space-y-2 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="font-medium">{subject}</p><p className="text-sm text-muted-foreground">{section.join(", ")}</p></div>
                    <Badge variant="secondary" className="shrink-0">{c.amount} {unit}</Badge>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">{c.when.split("; ").map((m) => <li key={m} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{m}</li>)}</ul>
                </li>
              );
            })}
          </ul>
          </CollectionView>
        )}
      </section>
    </div>
  );
}
