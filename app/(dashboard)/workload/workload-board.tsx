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
import { LOAD_STATUS, LoadBar, LoadStatusLabel } from "@/components/workload/load-bar";
import { FixLog, FlagList } from "@/components/workload/fix-log";
import { ProposalCards } from "@/components/workload/proposals";
import type { FacultyLoadView, FixView, ProposalView } from "@/lib/workload/view";
import type { Flag } from "@/lib/workload/optimizer";
import { recheckWorkloadAction } from "./actions";

export function WorkloadBoard(props: {
  staff: boolean;
  measure: "HOURS" | "UNITS";
  mode: "AUTOMATIC" | "APPROVAL";
  status: { checkedAt: string; trigger: string } | null;
  flags: Flag[];
  rows: FacultyLoadView[];
  proposals: ProposalView[];
  fixes: FixView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(props.staff ? null : (props.rows[0]?.facultyId ?? null));
  const unit = props.measure === "HOURS" ? "hours" : "units";
  const rows = useMemo(() => props.rows.filter((r) => !filter || r.status === filter), [props.rows, filter]);
  const counts = (s: keyof typeof LOAD_STATUS) => props.rows.filter((r) => r.status === s).length;

  function recheck() {
    startTransition(async () => {
      const res = await recheckWorkloadAction();
      if (!res.ok) return void toast.error(res.error);
      const { applied, proposed, flags } = res.data;
      toast.success(applied ? `${applied} fix(es) applied.` : proposed ? "Fixes are waiting for approval." : "All loads checked; no new fix needed.");
      if (flags) toast.warning(`${flags} item(s) need manual attention.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {props.staff && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={props.mode === "AUTOMATIC" ? "default" : "secondary"}>
              {props.mode === "AUTOMATIC" ? "Fully automatic" : "Approval required"}
            </Badge>
            <span className="text-muted-foreground">
              {props.status
                ? `Last checked ${new Date(props.status.checkedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })} after: ${props.status.trigger}.`
                : "Loads have not been checked yet."}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="destructive">{counts("OVERLOADED")} overloaded</Badge>
              <Badge variant="secondary">{counts("UNDERLOADED")} underloaded</Badge>
              <Badge variant="outline">{counts("BALANCED")} balanced</Badge>
            </div>
            <Button className="ml-auto" size="sm" variant="outline" onClick={recheck} disabled={pending}>
              {pending ? <CircleNotch className="size-4 animate-spin" /> : <ArrowsClockwise className="size-4" />} Recheck now
            </Button>
          </CardContent>
        </Card>
      )}

      {props.staff && (
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

      <ProposalCards proposals={props.proposals} unit={unit} />

      <Card className="print-area">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 print:hidden">
          <CardTitle className="text-base">{props.staff ? "Teaching load by faculty member" : "My classes"}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {props.staff && (
              <NativeSelect aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value)} options={[{ value: "", label: "All faculty" }, ...Object.entries(LOAD_STATUS).map(([v, s]) => ({ value: v, label: s.label }))]} className="w-44" />
            )}
            <ExportButtons
              filename="faculty-workload"
              rows={rows}
              columns={[
                { header: "Faculty member", value: (r) => r.name },
                { header: "Department", value: (r) => r.department },
                { header: `Load (${unit})`, value: (r) => r.load },
                { header: `Minimum (${unit})`, value: (r) => r.minimum },
                { header: `Maximum (${unit})`, value: (r) => r.maximum },
                { header: "Status", value: (r) => LOAD_STATUS[r.status].label },
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
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">{r.load} {unit} · allowed {r.minimum} to {r.maximum}</p>
                    </TableCell>
                    <TableCell><LoadStatusLabel status={r.status} /></TableCell>
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
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{props.staff ? "Workload fix log" : "Changes to my load"}</CardTitle></CardHeader>
        <CardContent><FixLog fixes={props.fixes} empty={props.staff ? "No workload fixes yet." : "Your load has not been changed by a workload fix."} /></CardContent>
      </Card>
    </div>
  );
}
