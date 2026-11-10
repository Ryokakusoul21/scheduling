"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowsClockwise, CircleNotch } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
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
  const [tab, setTab] = useState<"current" | "history">("current");
  const [open, setOpen] = useState<string | null>(props.staff ? null : (props.rows[0]?.facultyId ?? null));
  const unit = props.measure === "HOURS" ? "hours" : "units";
  const rows = useMemo(() => props.rows.filter((r) => !filter || (filter === "NEAR_LIMIT" ? r.nearLimit : r.status === filter)), [props.rows, filter]);
  const approval = (r: FacultyLoadView) => (r.pendingChange === null ? "No change pending" : `Awaiting approval: ${r.pendingChange > 0 ? "+" : ""}${r.pendingChange} ${unit}`);

  function recheck() {
    startTransition(async () => {
      const res = await recheckWorkloadAction();
      if (!res.ok) return void toast.error(res.error);
      const { proposed, flags } = res.data;
      toast.success(proposed ? "Fixes are waiting for Head of Department approval." : "All loads checked; no new fix needed.");
      if (flags) toast.warning(`${flags} item(s) need manual attention.`);
      router.refresh();
    });
  }

  const s = props.summary;
  return (
    <div className="space-y-4">
      {props.staff && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm" aria-label="Balance summary">
            <Stat label="Overloaded" value={s.overloaded} className={LOAD_STATUS.OVERLOADED.text} />
            <Stat label="Underloaded" value={s.underloaded} className={LOAD_STATUS.UNDERLOADED.text} />
            <Stat label="Balanced" value={s.balanced} className={LOAD_STATUS.BALANCED.text} hint={s.nearLimit ? `${s.nearLimit} near limit` : undefined} />
            <Stat label="Department balance score" value={`${s.score} / 100`} hint={props.tolerance ? `in range and within ${props.tolerance} ${unit} of the department average` : "share in range"} />
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <Badge variant="secondary">Head of Department approval required</Badge>
              {props.canReview && <Button size="sm" variant="outline" onClick={recheck} disabled={pending}>
                {pending ? <CircleNotch className="size-4 animate-spin" /> : <ArrowsClockwise className="size-4" />} Recheck now
              </Button>}
            </div>
            <p className="w-full text-xs text-muted-foreground">
              {props.status ? `Last checked ${new Date(props.status.checkedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })} after: ${props.status.trigger}.` : "Loads have not been checked yet."}
            </p>
          </CardContent>
        </Card>
      )}

      {props.canReview && (
        <div role="tablist" aria-label="Proposals" className="flex w-fit rounded-md border p-1">
          {(["current", "history"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="rounded px-3 py-1 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-muted aria-selected:font-semibold">
              {t === "current" ? `Current${props.proposals.length ? ` (${props.proposals.length})` : ""}` : "History"}
            </button>
          ))}
        </div>
      )}

      {props.canReview && tab === "history" && (
        props.history.length ? <ProposalCards proposals={props.history} unit={unit} history /> : <p className="text-sm text-muted-foreground">No past proposals yet.</p>
      )}

      {tab === "current" && <>
        {props.canReview && (
          <Card>
            <CardHeader><CardTitle className="text-base">Needs manual attention</CardTitle></CardHeader>
            <CardContent>
              <FlagList flags={props.flags.filter((f) => f.kind !== "UNDERLOADED")} />
              {props.flags.some((f) => f.kind === "UNDERLOADED") && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">{props.flags.filter((f) => f.kind === "UNDERLOADED").length} faculty remain underloaded with no compatible class to take</summary>
                  <div className="mt-2"><FlagList flags={props.flags.filter((f) => f.kind === "UNDERLOADED")} /></div>
                </details>
              )}
            </CardContent>
          </Card>
        )}

        <ProposalCards proposals={props.proposals} unit={unit} preview={props.preview} />

        {!props.staff ? <MyLoad r={props.rows[0]} unit={unit} approval={approval} /> : <Card className="print-area">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 print:hidden">
            <CardTitle className="text-base">{props.staff ? "Teaching load by faculty member" : "My classes"}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {props.staff && (
                <NativeSelect aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value)} options={[{ value: "", label: "All faculty" }, ...Object.entries(LOAD_STATUS).map(([v, st]) => ({ value: v, label: st.label })), { value: "NEAR_LIMIT", label: NEAR_LIMIT.label }]} className="w-44" />
              )}
              <ExportButtons
                filename="faculty-workload"
                rows={rows}
                columns={[
                  { header: "Faculty member", value: (r) => r.name },
                  { header: "Department", value: (r) => r.department },
                  { header: `Load (${unit})`, value: (r) => r.load },
                  { header: "Units", value: (r) => r.units },
                  { header: `Minimum (${unit})`, value: (r) => r.minimum },
                  { header: `Maximum (${unit})`, value: (r) => r.maximum },
                  { header: "Status", value: (r) => (r.nearLimit ? NEAR_LIMIT.label : LOAD_STATUS[r.status].label) },
                  { header: "Approval status", value: approval },
                  { header: "Classes", value: (r) => r.classes.length },
                ]}
              />
            </div>
          </CardHeader>
          <CardContent>
            <PrintHeader title="Faculty Workload Report" />
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Faculty member</TableHead>
                    {props.staff && <TableHead>Department</TableHead>}
                    <TableHead className="w-64">Load against limits</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No faculty to show.</TableCell></TableRow>}
                  {rows.map((r) => [
                    <TableRow key={r.facultyId} className="cursor-pointer" onClick={() => setOpen(open === r.facultyId ? null : r.facultyId)} aria-expanded={open === r.facultyId}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      {props.staff && <TableCell className="text-sm">{r.department}</TableCell>}
                      <TableCell>
                        <LoadBar r={r} />
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">{r.load} {unit} · {r.units} units · allowed {r.minimum} to {r.maximum}</p>
                      </TableCell>
                      <TableCell>
                        <LoadStatusLabel status={r.status} r={r} />
                        {r.pendingChange !== null && <p className="mt-0.5 text-xs text-muted-foreground">{approval(r)}</p>}
                      </TableCell>
                    </TableRow>,
                    open === r.facultyId && (
                      <TableRow key={`${r.facultyId}-classes`}>
                        <TableCell colSpan={4} className="bg-muted/30">
                          {r.classes.length === 0 ? <p className="text-sm text-muted-foreground">No classes in the active terms.</p> : (
                            <ul className="space-y-1 text-sm">
                              {r.classes.map((c) => <li key={c.label}><span className="font-medium">{c.label}</span> · {c.amount} {unit} <span className="text-xs text-muted-foreground">({c.when})</span></li>)}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    ),
                  ])}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>}

        {(props.canReview || !props.staff) && <Card>
          <CardHeader><CardTitle className="text-base">{props.staff ? "Workload fix log" : "Changes to my load"}</CardTitle></CardHeader>
          <CardContent><FixLog fixes={props.fixes} empty={props.staff ? "No workload fixes yet." : "Your load has not been changed by a workload fix."} /></CardContent>
        </Card>}
      </>}
    </div>
  );
}

function Stat({ label, value, hint, className }: { label: string; value: number | string; hint?: string; className?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", className)}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
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
        )}
      </section>
    </div>
  );
}
