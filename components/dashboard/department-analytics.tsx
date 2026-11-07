"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardAnalytics } from "@/lib/analytics/dashboard";
import type { DepartmentExtras } from "@/lib/analytics/department";
import { analyticsBlocks } from "./admin-analytics";
import { DashboardToolbar, StatCards } from "./kit";
import { UpcomingList } from "./charts";

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

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Needs your attention</h3>
        {workloadPanel}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Pending approvals</CardTitle>
            <Badge variant={pendingCount ? "default" : "outline"}>{pendingCount}</Badge>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ApprovalGroup title="Schedule changes awaiting approval" href="/scheduler" total={totals.schedules} empty="No drafts or edited classes waiting." items={extras.approvals.schedules.map((s) => ({ id: s.id, title: s.label, detail: `${s.status} · ${s.detail}` }))} />
            <ApprovalGroup title="Room booking changes to review" href="/bookings" total={totals.bookingChanges} empty="No classes moved by bookings in the last two weeks." items={extras.approvals.bookingChanges.map((b) => ({ id: b.id, title: b.summary, detail: `${b.moved} class meeting(s) moved; undo from Room Booking or Schedule Adjustments if needed` }))} />
            <ApprovalGroup title="Unavailability reports" href="/adjustments" total={totals.reports} empty="No pending reports." items={extras.approvals.reports.map((r) => ({ id: r.id, title: r.name, detail: `${r.dates}: ${r.reason}`, href: `/adjustments?report=${r.id}` }))} />
          </CardContent>
        </Card>
      </div>

      <StatCards cards={cards} previous={data.previousLabel} />

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
