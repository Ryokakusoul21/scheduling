import Link from "next/link";
import { ArrowRight, Gauge } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LOAD_STATUS, LoadBar, LoadStatusLabel } from "@/components/workload/load-bar";
import { FixLog, FlagList } from "@/components/workload/fix-log";
import { ProposalCards } from "@/components/workload/proposals";
import type { FixView, FacultyLoadView, ProposalView } from "@/lib/workload/view";
import type { Flag } from "@/lib/workload/optimizer";

const ORDER = { OVERLOADED: 0, UNDERLOADED: 1, BALANCED: 2 };

/**
 * Live Workload Balance: every faculty member's load as a bar against the allowed band, color coded,
 * with the latest automatic fixes (undoable) and anything that needs a person. Kept current by LiveRefresh.
 */
export function WorkloadBalance({
  rows,
  measure,
  mode,
  checkedAt,
  flags,
  fixes,
  proposals,
  title = "Workload Balance",
}: {
  rows: FacultyLoadView[];
  measure: "HOURS" | "UNITS";
  mode: "AUTOMATIC" | "APPROVAL";
  checkedAt: string | null;
  flags: Flag[];
  fixes: FixView[];
  proposals: ProposalView[];
  title?: string;
}) {
  const unit = measure === "HOURS" ? "hours" : "units";
  const sorted = [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.load - a.load);
  const attention = flags.filter((f) => f.kind !== "UNDERLOADED");

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><Gauge className="size-4 text-primary" /> {title}</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={mode === "AUTOMATIC" ? "default" : "secondary"}>{mode === "AUTOMATIC" ? "Fully automatic" : "Approval required"}</Badge>
          {checkedAt && <span className="text-muted-foreground">Checked {new Date(checkedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span>}
          <Link href="/workload" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Open Faculty Workload <ArrowRight className="size-3" /></Link>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left: every faculty member's load. Right: what to act on. */}
        <section aria-label="Faculty loads" className="space-y-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
            {(Object.keys(LOAD_STATUS) as (keyof typeof LOAD_STATUS)[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${LOAD_STATUS[s].bar}`} />{LOAD_STATUS[s].label} ({rows.filter((r) => r.status === s).length})</span>
            ))}
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-emerald-500/20" />Allowed range</span>
          </div>
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
            {sorted.map((r) => (
              <li key={r.facultyId} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5.5rem_6.5rem] items-center gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50">
                <span className="truncate font-medium" title={`${r.name}, ${r.department}`}>{r.name}</span>
                <LoadBar r={r} />
                <span className="text-right text-xs tabular-nums text-muted-foreground" title={`Allowed ${r.minimum} to ${r.maximum} ${unit}`}>
                  {r.load} / {r.minimum}–{r.maximum}
                </span>
                <LoadStatusLabel status={r.status} />
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">Numbers show the current load and the allowed range in {unit}.</p>
        </section>

        <section aria-label="Actions" className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Fixes awaiting approval ({proposals.length})</p>
            {proposals.length ? <ProposalCards proposals={proposals} unit={unit} compact /> : <p className="text-sm text-muted-foreground">Nothing to approve.</p>}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Latest fixes</p>
            <FixLog fixes={fixes} empty="No fixes yet. They appear here as soon as they are applied." />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Needs manual attention</p>
            <FlagList flags={attention} />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
