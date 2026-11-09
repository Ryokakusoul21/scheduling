"use client";

import Link from "next/link";
import { ArrowRight, ChalkboardTeacher, ClipboardText, Warning } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardAnalytics } from "@/lib/analytics/dashboard";
import type { DepartmentExtras } from "@/lib/analytics/department";
import { analyticsBlocks } from "./admin-analytics";
import { DashboardToolbar, StatCards } from "./kit";
import { HoursBars, LoadDistributionChart, UpcomingList } from "./charts";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

const DEPARTMENT_CARDS = ["students", "sections", "faculty", "subjects", "roomRate", "facultyRate", "conflicts", "loads"];
const DEPARTMENT_LABELS: Record<string, string> = { roomRate: "Department Room Utilization Rate", facultyRate: "Department Faculty Utilization Rate", faculty: "Faculty teaching department classes" };

/** Items shown per approval group before the link to the full list. */
const SHOWN = 4;

export function DepartmentAnalyticsView({
  data,
  extras,
  department,
  terms,
  toggle,
  workloadPanel,
}: {
  data: DashboardAnalytics;
  extras: DepartmentExtras;
  department: string;
  terms: Option[];
  toggle: React.ReactNode;
  workloadPanel: React.ReactNode;
}) {
  const cards = data.cards.filter((c) => DEPARTMENT_CARDS.includes(c.key)).map((c) => ({ ...c, label: DEPARTMENT_LABELS[c.key] ?? c.label }));
  const blocks = analyticsBlocks({ ...data, cards }, `Department analytics: ${department}, ${data.term.label}`, DEPARTMENT_CARDS);
  blocks.push({
    title: "Pending approvals",
    header: ["Type", "Item", "Details"],
    rows: [
      ...extras.approvals.schedules.map((s) => ["Schedule change", s.label, `${s.status}; ${s.detail}`]),
      ...extras.approvals.bookingChanges.map((b) => ["Room booking change", b.summary, `${b.moved} class meeting(s) moved`]),
      ...extras.approvals.reports.map((r) => ["Unavailability report", r.name, `${r.dates}: ${r.reason}`]),
    ],
  });

  const { totals } = extras;
  const pendingCount = totals.schedules + totals.bookingChanges + totals.reports;

  return (
    <section aria-label="Department overview" className="print-area space-y-5">
      <DashboardToolbar
        title={`Department overview: ${department}`}
        printTitle={`Department Analytics Report: ${department}`}
        printSubtitle={data.term.label}
        filename="department-analytics-report"
        blocks={blocks}
        filters={[{ key: "term", label: "Semester", value: data.term.id, options: terms }]}
      >
        {toggle}
      </DashboardToolbar>

      <StatCards cards={cards} previous={data.previousLabel} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <FacultyHours rows={data.facultyRates} />
        <div className="grid gap-4">
          <LoadDistributionChart data={data.loadDistribution} />
          <HoursBars title="Rooms used most by department classes" rows={data.topRooms.map((r) => ({ name: r.name, hours: r.usedHours }))} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Warning className="size-5 text-amber-500" weight="fill" aria-hidden /> Needs your attention
          {pendingCount > 0 && <Badge>{pendingCount} waiting</Badge>}
        </h3>
        {workloadPanel}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardText className="size-5 text-primary" aria-hidden /> Pending approvals</CardTitle>
            <Badge variant={pendingCount ? "default" : "outline"}>{pendingCount}</Badge>
          </CardHeader>
          <CardContent className="grid gap-5 text-sm lg:grid-cols-3">
            <ApprovalGroup title="Schedule changes awaiting approval" href="/scheduler" total={totals.schedules} empty="No drafts or edited classes waiting." items={extras.approvals.schedules.map((s) => ({ id: s.id, title: s.label, detail: `${s.status} · ${s.detail}` }))} />
            <ApprovalGroup title="Room booking changes to review" href="/bookings" total={totals.bookingChanges} empty="No classes moved by bookings in the last two weeks." items={extras.approvals.bookingChanges.map((b) => ({ id: b.id, title: b.summary, detail: `${b.moved} class meeting(s) moved; undo from Room Booking or Schedule Adjustments if needed` }))} />
            <ApprovalGroup title="Unavailability reports" href="/adjustments" total={totals.reports} empty="No pending reports." items={extras.approvals.reports.map((r) => ({ id: r.id, title: r.name, detail: `${r.dates}: ${r.reason}`, href: `/adjustments?report=${r.id}` }))} />
          </CardContent>
        </Card>
      </div>

      <UpcomingList items={data.upcoming} title="Upcoming department examinations and activities" />

      <p className="text-sm text-muted-foreground">
        Utilization charts and peak hours are in <Link href="/analytics" className="font-medium text-primary hover:underline">Timetable Analytics</Link>; teaching loads are in <Link href="/workload" className="font-medium text-primary hover:underline">Faculty Workload</Link>.
      </p>
    </section>
  );
}

/** One group of waiting items: the first few, the real total, and a link to the rest. */
function ApprovalGroup({ title, href, total, empty, items }: { title: string; href: string; total: number; empty: string; items: { id: string; title: string; detail: string; href?: string }[] }) {
  const shown = items.slice(0, SHOWN);
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {title}
        {total > 0 && <Badge variant="secondary">{total}</Badge>}
      </p>
      {shown.length === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> : (
        <ul className="space-y-1.5">
          {shown.map((i) => (
            <li key={i.id}>
              <Link href={i.href ?? href} className="block rounded-md border px-2.5 py-1.5 hover:bg-accent">
                <span className="block truncate font-medium">{i.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > shown.length && (
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">View all {total} <ArrowRight className="size-3" /></Link>
      )}
    </div>
  );
}

type RateRow = DashboardAnalytics["facultyRates"][number];

/** Bar color for teaching hours against the maximum: red above it, amber when light, green otherwise. */
const hoursTone = (rate: number) => (rate > 100 ? "bg-red-500" : rate < 50 ? "bg-amber-500" : "bg-emerald-500");

/** Every department faculty member's weekly teaching hours against their maximum, heaviest first. */
function FacultyHours({ rows }: { rows: RateRow[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><ChalkboardTeacher className="size-5 text-primary" aria-hidden /> Faculty teaching hours</CardTitle>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {[["bg-red-500", "Over maximum"], ["bg-emerald-500", "Healthy"], ["bg-amber-500", "Light"]].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", c)} />{l}</span>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No faculty in this department yet.</p> : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <Link href="/workload" className="truncate font-medium hover:underline" title={r.name}>{r.name}</Link>
                <div role="progressbar" aria-label={`${r.name} teaching hours`} aria-valuenow={Math.round(r.rate)} aria-valuemin={0} aria-valuemax={100} className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", hoursTone(r.rate))} style={{ width: `${Math.min(100, r.rate)}%` }} />
                </div>
                <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground">{r.usedHours}</span> of {r.capacityHours} hours
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
