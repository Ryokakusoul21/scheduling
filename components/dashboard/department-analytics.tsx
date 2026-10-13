"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heatmap, RateChart } from "@/components/charts/utilization";
import type { DashboardAnalytics } from "@/lib/analytics/dashboard";
import type { DepartmentExtras } from "@/lib/analytics/department";
import { analyticsBlocks } from "./admin-analytics";
import { DashboardToolbar, StatCard, StatGrid } from "./kit";
import { EnrollmentChart, HoursBars, LoadDistributionChart, UpcomingList } from "./charts";

type Option = { value: string; label: string };

const DEPARTMENT_CARDS = ["students", "sections", "faculty", "subjects", "roomRate", "facultyRate", "conflicts", "loads"];
const DEPARTMENT_LABELS: Record<string, string> = { roomRate: "Department Room Utilization Rate", facultyRate: "Department Faculty Utilization Rate", faculty: "Faculty teaching department classes" };

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
  if (extras.needs) {
    blocks.push({
      title: `Needs for ${extras.needs.term}`,
      header: ["Resource", "Needed", "Now"],
      rows: [["Sections", extras.needs.sections.needed, extras.needs.sections.now], ["Faculty", extras.needs.faculty.needed, extras.needs.faculty.now], ...extras.needs.rooms.map((r) => [r.type, r.needed, r.now])],
    });
  }
  blocks.push({
    title: "Pending approvals",
    header: ["Type", "Item", "Details"],
    rows: [
      ...extras.approvals.schedules.map((s) => ["Schedule change", s.label, `${s.status}; ${s.detail}`]),
      ...extras.approvals.bookingChanges.map((b) => ["Room booking change", b.summary, `${b.moved} class meeting(s) moved`]),
      ...extras.approvals.reports.map((r) => ["Unavailability report", r.name, `${r.dates}: ${r.reason}`]),
    ],
  });

  const pendingCount = extras.approvals.schedules.length + extras.approvals.bookingChanges.length + extras.approvals.reports.length;

  return (
    <section aria-label="Department analytics" className="print-area space-y-4">
      <DashboardToolbar
        title={`Department analytics: ${department}`}
        printTitle={`Department Analytics Report: ${department}`}
        printSubtitle={data.term.label}
        filename="department-analytics-report"
        blocks={blocks}
        filters={[{ key: "term", label: "Semester", value: data.term.id, options: terms }]}
      >
        {toggle}
      </DashboardToolbar>

      <StatGrid>
        {cards.map((c) => <StatCard key={c.key} label={c.label} value={c.value} hint={c.hint} change={c.change} previous={data.previousLabel} />)}
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <RateChart title="Faculty Utilization Rate per faculty member" rows={data.facultyRates} unit="maximum hours" limit={14} />
        <LoadDistributionChart data={data.loadDistribution} />
      </div>

      {workloadPanel}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <HoursBars title="Rooms most used by the department" rows={data.topRooms.map((r) => ({ name: r.name, hours: r.usedHours }))} />
        <Heatmap grid={data.heatmap} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EnrollmentChart data={data.enrollment} title="Department enrollment trend and forecast">
          {extras.needs && (
            <div className="space-y-1.5 text-sm">
              <p className="font-medium">Needed for {extras.needs.term}</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {[
                  { name: "Sections", ...extras.needs.sections },
                  { name: "Faculty", ...extras.needs.faculty },
                  ...extras.needs.rooms.map((r) => ({ name: r.type, needed: r.needed, now: r.now })),
                ].map((n) => (
                  <li key={n.name} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                    <span>{n.name}</span>
                    <span className="flex items-center gap-1.5 tabular-nums">
                      {n.needed} needed · {n.now} now
                      {n.needed > n.now && <Badge variant="destructive">Short by {n.needed - n.now}</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </EnrollmentChart>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Pending approvals</CardTitle>
            <Badge variant={pendingCount ? "default" : "outline"}>{pendingCount}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Workload fix proposals are in the Workload Balance panel above.</p>
            <ApprovalGroup title="Schedule changes awaiting approval" href="/scheduler" empty="No drafts or edited classes waiting." items={extras.approvals.schedules.map((s) => ({ id: s.id, title: s.label, detail: `${s.status} · ${s.detail}` }))} />
            <ApprovalGroup title="Room booking changes to review" href="/bookings" empty="No classes moved by bookings in the last two weeks." items={extras.approvals.bookingChanges.map((b) => ({ id: b.id, title: b.summary, detail: `${b.moved} class meeting(s) moved; undo from Room Booking or Schedule Adjustments if needed` }))} />
            <ApprovalGroup title="Unavailability reports" href="/adjustments" empty="No pending reports." items={extras.approvals.reports.map((r) => ({ id: r.id, title: r.name, detail: `${r.dates}: ${r.reason}`, href: `/adjustments?report=${r.id}` }))} />
          </CardContent>
        </Card>
      </div>

      <UpcomingList items={data.upcoming} title="Upcoming department examinations and activities" />
    </section>
  );
}

function ApprovalGroup({ title, href, empty, items }: { title: string; href: string; empty: string; items: { id: string; title: string; detail: string; href?: string }[] }) {
  return (
    <div className="space-y-1.5">
      <Link href={href} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">{title} <ArrowRight className="size-3" /></Link>
      {items.length === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={i.href ?? href} className="block rounded-md border px-2.5 py-1.5 hover:bg-accent">
                <span className="block truncate font-medium">{i.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
