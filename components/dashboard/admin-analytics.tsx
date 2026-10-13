"use client";

import { Heatmap, RateChart } from "@/components/charts/utilization";
import { LOAD_STATUS } from "@/components/workload/load-bar";
import { HEATMAP_DAYS, HEATMAP_HOURS } from "@/lib/analytics/timetable";
import type { DashboardAnalytics } from "@/lib/analytics/dashboard";
import { DAY_LONG, formatTime } from "@/lib/scheduler/timetable";
import { cardBlock, DashboardToolbar, StatCard, StatGrid, type ReportBlock } from "./kit";
import { EnrollmentChart, LoadDistributionChart, UpcomingList, WeeklyChart } from "./charts";

type Option = { value: string; label: string };

const ADMIN_CARDS = ["students", "sections", "faculty", "rooms", "roomRate", "facultyRate", "conflicts", "loads"];

/** Report blocks shared by the Administrator and Head of Department analytics exports. */
export function analyticsBlocks(d: DashboardAnalytics, heading: string, cardKeys: string[]): ReportBlock[] {
  return [
    cardBlock(heading, d.cards.filter((c) => cardKeys.includes(c.key))),
    { title: "Room Utilization Rate per room", header: ["Room", "Building", "Scheduled hours", "Available hours", "Utilization Rate (percent)", "Note"], rows: d.rooms.map((r) => [r.name, r.group, r.usedHours, r.capacityHours, r.rate, r.mark === "MOST" ? "Most used" : r.mark === "LEAST" ? "Least used" : ""]) },
    { title: "Faculty Utilization Rate per faculty member", header: ["Faculty member", "Department", "Teaching hours", "Maximum hours", "Utilization Rate (percent)"], rows: d.facultyRates.map((r) => [r.name, r.group, r.usedHours, r.capacityHours, r.rate]) },
    { title: "Peak scheduling hours (class meetings in session)", header: ["Day", ...HEATMAP_HOURS.map((h) => formatTime(h * 60))], rows: d.heatmap.map((row, i) => [DAY_LONG[HEATMAP_DAYS[i]], ...row]) },
    { title: "Enrollment trend", header: ["Term", "Students"], rows: [...d.enrollment.points.map((p) => [p.label, p.enrolled]), ...(d.enrollment.forecast ? [[`${d.enrollment.forecast.label} (forecast, range ${d.enrollment.forecast.low} to ${d.enrollment.forecast.high})`, d.enrollment.forecast.value]] : [])] },
    { title: "Faculty teaching load distribution", header: ["Status", "Faculty"], rows: d.loadDistribution.map((l) => [LOAD_STATUS[l.status].label, l.count]) },
    { title: "Room bookings and conflicts resolved per week", header: ["Week starting", "Room bookings", "Conflicts resolved"], rows: d.weekly.map((w) => [String(w.week), w.bookings, w.resolved]) },
    { title: "Upcoming examinations and activities", header: ["Date", "Type", "Title", "Details"], rows: d.upcoming.map((u) => [u.date === u.endDate ? u.date : `${u.date} to ${u.endDate}`, u.kind, u.title, u.detail]) },
  ];
}

export function AdminAnalytics({
  data,
  filters,
}: {
  data: DashboardAnalytics;
  filters: { term: string; department: string; building: string; terms: Option[]; departments: Option[]; buildings: Option[] };
}) {
  const scope = [
    filters.departments.find((d) => d.value === filters.department)?.label ?? "All departments",
    filters.buildings.find((b) => b.value === filters.building)?.label ?? "All buildings",
  ].join(", ");
  const blocks = analyticsBlocks(data, `Administrator analytics, ${data.term.label} (${scope})`, ADMIN_CARDS);
  blocks.splice(1, 0, { title: "Room Utilization Rate per building", header: ["Building", "Rooms", "Scheduled hours", "Available hours", "Utilization Rate (percent)"], rows: data.buildings.map((r) => [r.name, r.group, r.usedHours, r.capacityHours, r.rate]) });
  blocks.splice(4, 0, { title: "Faculty Utilization Rate per department", header: ["Department", "Faculty", "Teaching hours", "Maximum hours", "Utilization Rate (percent)"], rows: data.departments.map((r) => [r.name, r.group, r.usedHours, r.capacityHours, r.rate]) });

  return (
    <section aria-label="Data analytics" className="print-area space-y-4">
      <DashboardToolbar
        title="Data analytics"
        printTitle={`Administrator Analytics Report: ${data.term.label}`}
        printSubtitle={scope}
        filename="administrator-analytics-report"
        blocks={blocks}
        filters={[
          { key: "term", label: "Semester", value: filters.term, options: filters.terms },
          { key: "department", label: "Department", value: filters.department, options: filters.departments, allLabel: "All departments" },
          { key: "building", label: "Building", value: filters.building, options: filters.buildings, allLabel: "All buildings" },
        ]}
      />

      <StatGrid>
        {data.cards.filter((c) => ADMIN_CARDS.includes(c.key)).map((c) => (
          <StatCard key={c.key} label={c.label} value={c.value} hint={c.hint} change={c.change} previous={data.previousLabel} />
        ))}
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <RateChart title="Room Utilization Rate per building" rows={data.buildings} unit="available hours" />
        <RateChart title="Room Utilization Rate per room" rows={data.rooms} unit="available hours" limit={12} />
        <RateChart title="Faculty Utilization Rate per department" rows={data.departments} unit="maximum hours" />
        <LoadDistributionChart data={data.loadDistribution} />
      </div>

      <Heatmap grid={data.heatmap} />

      <div className="grid gap-4 lg:grid-cols-2">
        <EnrollmentChart data={data.enrollment} />
        <WeeklyChart data={data.weekly} />
      </div>

      <UpcomingList items={data.upcoming} />
    </section>
  );
}
