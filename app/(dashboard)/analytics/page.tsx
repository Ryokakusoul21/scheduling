import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { byGroup, facultyUtilization, overall, peakHeatmap, roomUtilization } from "@/lib/analytics/timetable";
import Link from "next/link";
import { PageHeader } from "@/components/ux/states";
import { AdminPanels } from "@/components/dashboard/admin-panels";
import { cn } from "@/lib/utils";
import { AnalyticsCharts } from "./analytics-charts";
import { OverrideReport } from "@/components/bookings/override-report";

export const metadata = { title: "Timetable Analytics · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

/** Weekly hours a room can be used when it has no availability windows: Monday to Saturday, 7:00 AM to 7:00 PM. */
const DEFAULT_ROOM_HOURS = 6 * 12;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ term?: string; department?: string; building?: string; view?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const params = await searchParams;

  // The Administrator also gets the school-wide overview that used to sit on the dashboard.
  const overview = scope.isAdmin && params.view === "overview";
  const current = overview ? "overview" : "";
  const tabs = scope.isAdmin && (
    <div className="flex rounded-md border p-0.5" role="tablist" aria-label="Analytics view">
      {([["", "Timetable utilization"], ["overview", "School overview"]] as const).map(([v, label]) => (
        <Link
          key={v}
          role="tab"
          aria-selected={current === v}
          href={v ? `/analytics?view=${v}` : "/analytics"}
          scroll={false}
          className={cn("rounded px-3 py-1.5 text-sm font-medium", current === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          {label}
        </Link>
      ))}
    </div>
  );
  if (overview) {
    return (
      <div className="space-y-4">
        <PageHeader title="Timetable Analytics" description="School-wide figures, charts, and trends for the selected semester, department, and building." actions={tabs} />
        <AdminPanels params={params} />
      </div>
    );
  }

  const [terms, departments] = await Promise.all([
    prisma.semester.findMany({ include: { academicYear: { select: { name: true } } }, orderBy: [{ startDate: "desc" }, { level: "asc" }] }),
    prisma.department.findMany({ where: departmentWhere.department(scope), orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const selectedTerm = terms.find((t) => t.id === params.term);
  const termIds = selectedTerm ? [selectedTerm.id] : terms.filter((t) => t.isActive).map((t) => t.id);
  // A Head of Department always sees their own department; the Administrator may pick one or see all.
  const departmentId = scope.isAdmin ? (departments.some((d) => d.id === params.department) ? params.department! : null) : scope.manageDepartmentId;

  const [schedules, rooms, faculty] = await Promise.all([
    prisma.schedule.findMany({
      where: { semesterId: { in: termIds }, status: { not: "ARCHIVED" }, ...(departmentId ? { section: { departmentId } } : {}) },
      select: { roomId: true, facultyId: true, dayOfWeek: true, startMin: true, endMin: true },
    }),
    prisma.room.findMany({ where: { AND: [departmentWhere.room(scope), { archivedAt: null }] }, include: { availability: true, floor: { select: { building: { select: { name: true } } } } } }),
    prisma.faculty.findMany({ where: { status: "ACTIVE", archivedAt: null, ...(departmentId ? { departmentId } : {}) }, include: { department: { select: { name: true } } } }),
  ]);

  // With a department filter, only rooms that department owns and shared rooms it uses are listed.
  const usedRooms = new Set(schedules.map((s) => s.roomId));
  const roomRows = roomUtilization(
    schedules,
    rooms
      .filter((r) => !departmentId || r.departmentId === departmentId || (!r.departmentId && usedRooms.has(r.id)))
      .map((r) => ({
        id: r.id,
        name: r.roomName,
        building: r.floor?.building.name ?? "No building",
        availableHours: r.availability.length ? r.availability.reduce((s, a) => s + (a.endMin - a.startMin), 0) / 60 : DEFAULT_ROOM_HOURS,
      }))
  );
  const facultyRows = facultyUtilization(
    // Faculty load counts every class they teach, not only the filtered department's sections.
    departmentId
      ? await prisma.schedule.findMany({ where: { semesterId: { in: termIds }, status: { not: "ARCHIVED" }, facultyId: { in: faculty.map((f) => f.id) } }, select: { roomId: true, facultyId: true, dayOfWeek: true, startMin: true, endMin: true } })
      : schedules,
    faculty.map((f) => ({ id: f.id, name: f.fullName, department: f.department?.name ?? "No department", maxHours: f.maxHours }))
  );

  const termLabelOf = (t: (typeof terms)[number]) => `${levelLabel(t.level)} ${termLabel(t.type)} ${t.academicYear.name}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Timetable Analytics"
        description="Room Utilization Rate, Faculty Utilization Rate, and peak scheduling hours, computed automatically from the published timetable."
        actions={tabs}
      />
      <AnalyticsCharts
        filters={{
          term: selectedTerm?.id ?? "",
          department: departmentId ?? "",
          terms: terms.map((t) => ({ value: t.id, label: termLabelOf(t) })),
          departments: scope.isAdmin ? departments.map((d) => ({ value: d.id, label: d.name })) : [],
          departmentName: departments.find((d) => d.id === departmentId)?.name ?? "All departments",
          termName: selectedTerm ? termLabelOf(selectedTerm) : "All active terms",
        }}
        meetings={schedules.length}
        rooms={roomRows}
        buildings={byGroup(roomRows)}
        roomOverall={overall(roomRows)}
        faculty={facultyRows}
        departments={byGroup(facultyRows)}
        facultyOverall={overall(facultyRows)}
        heatmap={peakHeatmap(schedules)}
      />
      <OverrideReport departmentId={departmentId} />
    </div>
  );
}
