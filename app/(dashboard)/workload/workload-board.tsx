"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, CircleNotch, Sparkle, Warning, XCircle } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import type { LoadRow, Move } from "@/lib/workload/optimizer";
import { cn } from "@/lib/utils";
import { approveProposalAction, generateProposalAction, rejectProposalAction } from "./actions";

export interface FacultyLoad extends LoadRow {
  department: string;
  classes: { label: string; amount: number; when: string }[];
}

export interface ProposalView {
  id: string;
  status: string;
  createdAt: string;
  explanation: string;
  narrative: string | null;
  canReview: boolean;
  moves: (Move & { from: string; to: string })[];
}

const STATUS = {
  OVERLOADED: { label: "Overloaded", icon: Warning, className: "text-red-700 dark:text-red-400" },
  UNDERLOADED: { label: "Underloaded", icon: Warning, className: "text-amber-700 dark:text-amber-400" },
  BALANCED: { label: "Within limits", icon: CheckCircle, className: "text-emerald-700 dark:text-emerald-400" },
};

/** Load bar with the allowed band marked, so position against both limits is visible at a glance. */
function LoadBar({ r }: { r: LoadRow }) {
  const scale = Math.max(r.maximum * 1.25, r.load, 1);
  const pct = (n: number) => `${Math.min((n / scale) * 100, 100)}%`;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-muted" aria-hidden>
      <div className="absolute inset-y-0 rounded-full bg-emerald-500/20" style={{ left: pct(r.minimum), width: `calc(${pct(r.maximum)} - ${pct(r.minimum)})` }} />
      <div className={cn("absolute inset-y-0 left-0 rounded-full", r.status === "OVERLOADED" ? "bg-red-500" : r.status === "UNDERLOADED" ? "bg-amber-500" : "bg-[var(--chart-1)]")} style={{ width: pct(r.load) }} />
    </div>
  );
}

export function WorkloadBoard(props: {
  staff: boolean;
  measure: "HOURS" | "UNITS";
  termId: string;
  terms: { value: string; label: string }[];
  rows: FacultyLoad[];
  proposals: ProposalView[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(props.staff ? null : props.rows[0]?.facultyId ?? null);
  const unit = props.measure === "HOURS" ? "hours" : "units";
  const rows = useMemo(() => props.rows.filter((r) => !filter || r.status === filter), [props.rows, filter]);
  const counts = (s: keyof typeof STATUS) => props.rows.filter((r) => r.status === s).length;

  function generate() {
    startTransition(async () => {
      const res = await generateProposalAction(props.termId);
      if (!res.ok) return void toast.error(res.error);
      if (res.data.proposalId) toast.success("Suggestions ready for approval.");
      else toast.info(res.data.explanation);
      router.refresh();
    });
  }

  function review(id: string, approve: boolean) {
    startTransition(async () => {
      if (!approve) {
        const res = await rejectProposalAction(id);
        if (res.ok) toast.success("Proposal rejected."); else toast.error(res.error);
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
    <div className="space-y-4">
      {props.staff && (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Term" value={props.termId} onChange={(e) => router.push(`/workload?term=${e.target.value}`)} options={props.terms} className="w-64" />
          <NativeSelect aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value)} options={[{ value: "", label: "All faculty" }, ...Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label }))]} className="w-44" />
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge variant="destructive">{counts("OVERLOADED")} overloaded</Badge>
            <Badge variant="secondary">{counts("UNDERLOADED")} underloaded</Badge>
            <Badge variant="outline">{counts("BALANCED")} within limits</Badge>
          </div>
          <Button className="ml-auto" onClick={generate} disabled={pending}>
            {pending ? <CircleNotch className="size-4 animate-spin" /> : <Sparkle className="size-4" />} Suggest balanced assignments
          </Button>
        </div>
      )}

      {props.proposals.map((p) => (
        <Card key={p.id} className={cn(p.status === "PENDING" && "border-primary/40")}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              Reassignment proposal
              <Badge variant={p.status === "PENDING" ? "default" : "outline"}>{p.status === "PENDING" ? "Awaiting approval" : p.status === "APPLIED" ? "Approved and applied" : "Rejected"}</Badge>
            </CardTitle>
            {p.canReview && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => review(p.id, false)}><XCircle className="size-4" /> Reject</Button>
                <Button size="sm" disabled={pending} onClick={() => review(p.id, true)}><CheckCircle className="size-4" /> Approve and apply</Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{p.explanation}</p>
            {p.narrative && (
              <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-sm"><Sparkle className="mt-0.5 size-4 shrink-0 text-primary" />{p.narrative}</p>
            )}
            <ul className="divide-y rounded-lg border">
              {p.moves.map((m) => (
                <li key={m.key} className="space-y-1 p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {m.label} <Badge variant="secondary">{m.amount} {unit}</Badge>
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs">{m.from} <ArrowRight className="size-3" /> {m.to}</p>
                  <p className="text-xs text-muted-foreground">{m.reason}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      {props.staff && !props.aiEnabled && (
        <p className="text-xs text-muted-foreground">Suggestions come from the built-in optimizer. Add a Gemini key to also get a written narrative for each proposal.</p>
      )}

      <Card className="print-area">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 print:hidden">
          <CardTitle className="text-base">{props.staff ? "Teaching load by faculty member" : "My classes this term"}</CardTitle>
          <ExportButtons
            filename="faculty-workload"
            rows={rows}
            columns={[
              { header: "Faculty member", value: (r) => r.name },
              { header: "Department", value: (r) => r.department },
              { header: `Load (${unit})`, value: (r) => r.load },
              { header: `Minimum (${unit})`, value: (r) => r.minimum },
              { header: `Maximum (${unit})`, value: (r) => r.maximum },
              { header: "Status", value: (r) => STATUS[r.status].label },
              { header: "Classes", value: (r) => r.classes.length },
            ]}
          />
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
                {rows.map((r) => {
                  const s = STATUS[r.status];
                  return [
                    <TableRow key={r.facultyId} className="cursor-pointer" onClick={() => setOpen(open === r.facultyId ? null : r.facultyId)} aria-expanded={open === r.facultyId}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      {props.staff && <TableCell className="text-sm">{r.department}</TableCell>}
                      <TableCell>
                        <LoadBar r={r} />
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">{r.load} {unit} · allowed {r.minimum} to {r.maximum}</p>
                      </TableCell>
                      <TableCell><span className={cn("flex items-center gap-1 text-sm font-medium", s.className)}><s.icon className="size-4" />{s.label}</span></TableCell>
                    </TableRow>,
                    open === r.facultyId && (
                      <TableRow key={`${r.facultyId}-classes`}>
                        <TableCell colSpan={4} className="bg-muted/30">
                          {r.classes.length === 0 ? <p className="text-sm text-muted-foreground">No classes this term.</p> : (
                            <ul className="space-y-1 text-sm">
                              {r.classes.map((c) => <li key={c.label}><span className="font-medium">{c.label}</span> · {c.amount} {unit} <span className="text-xs text-muted-foreground">({c.when})</span></li>)}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    ),
                  ];
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
