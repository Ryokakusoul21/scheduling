import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { activeOverlapConflicts } from "@/lib/scheduler/term-conflicts";
import { AnalyticsCharts } from "./analytics-charts";

export const metadata = { title: "Analytics · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DAY_LABELS: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat",
};

export default async function AnalyticsPage() {
  await requireRole("ADMINISTRATOR", "HEAD_OF_DEPARTMENT");

  const [schedules, rooms, faculty, sections] = await Promise.all([
    prisma.schedule.findMany({ where: { status: { not: "ARCHIVED" } } }),
    prisma.room.findMany(),
    prisma.faculty.findMany(),
    prisma.section.findMany(),
  ]);

  const classesPerDay = DAYS.map((d) => ({
    day: DAY_LABELS[d],
    classes: schedules.filter((s) => s.dayOfWeek === d).length,
  }));

  const AVAILABLE_MIN_PER_WEEK = 6 * 12 * 60;
  const roomUtilization = rooms
    .map((r) => {
      const min = schedules.filter((s) => s.roomId === r.id).reduce((s, e) => s + (e.endMin - e.startMin), 0);
      return { room: r.roomNumber, utilization: Math.min(Math.round((min / AVAILABLE_MIN_PER_WEEK) * 100), 100) };
    })
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, 8);

  const workloadBuckets = { Underloaded: 0, Normal: 0, Overloaded: 0 };
  for (const f of faculty) {
    const min = schedules.filter((s) => s.facultyId === f.id).reduce((s, e) => s + (e.endMin - e.startMin), 0);
    const utilization = (min / 60 / Math.max(f.maxHours, 1)) * 100;
    if (utilization < 60) workloadBuckets.Underloaded++;
    else if (utilization > 100) workloadBuckets.Overloaded++;
    else workloadBuckets.Normal++;
  }
  const workloadData = Object.entries(workloadBuckets).map(([name, value]) => ({ name, value }));

  const conflicts = await activeOverlapConflicts();

  const enrollmentPerSection = sections
    .map((s) => ({ section: s.name, students: s.studentCount }))
    .sort((a, b) => b.students - a.students)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Live operational analytics computed from the current database.</p>
      </div>

      <AnalyticsCharts
        classesPerDay={classesPerDay}
        roomUtilization={roomUtilization}
        workloadData={workloadData}
        enrollmentPerSection={enrollmentPerSection}
        totalClasses={schedules.length}
        conflictCount={conflicts.length}
      />
    </div>
  );
}
