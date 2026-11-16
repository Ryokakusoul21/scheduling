import { roomLabel } from "@/lib/rooms/label";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { ACADEMIC_LEVELS, isAcademicLevel, levelLabel, termLabel } from "@/lib/academics/levels";
import { byGroup, facultyUtilization, overall, peakHeatmap, roomUtilization } from "@/lib/analytics/timetable";
import Link from "next/link";
import { PageHeader } from "@/components/ux/states";
import { AdminPanels } from "@/components/dashboard/admin-panels";
import { cn } from "@/lib/utils";
import { AnalyticsCharts } from "./analytics-charts";
import { OverrideReport } from "@/components/bookings/override-report";
import { isoDate } from "@/lib/occupancy/engine";
import { scheduleInsights, SCHEDULE_STATES, weeklyAvailableHours, type ScheduleState } from "@/lib/analytics/schedule-insights";

export const metadata = { title: "Timetable Analytics · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** Weekly hours a room can be used when it has no availability windows: Monday to Saturday, 7:00 AM to 7:00 PM. */
const DEFAULT_ROOM_HOURS = 6 * 12;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ term?: string; department?: string; building?: string; view?: string; status?: string; level?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const params = await searchParams;
  const level = isAcademicLevel(params.level) ? params.level : undefined;

  // The Registrar also gets the school-wide overview that used to sit on the dashboard.
  const overview = scope.isAdmin && params.view === "overview";
  const current = overview ? "overview" : "";
  const tabs = scope.isAdmin && (
    <nav className="flex rounded-lg border bg-card p-1" aria-label="Analytics view">
      {([["", "Timetable utilization"], ["overview", "School overview"]] as const).map(([v, label]) => (
        <Link
          key={v}
          aria-current={current === v ? "page" : undefined}
          href={`/analytics?${new URLSearchParams({ ...(params.term ? { term: params.term } : {}), ...(params.department ? { department: params.department } : {}), ...(params.building ? { building: params.building } : {}), ...(params.status ? { status: params.status } : {}), ...(v ? { view: v } : {}) })}`}
          scroll={false}
          className={cn("rounded px-3 py-1.5 text-sm font-medium", current === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
  if (overview) {
    return (
      <div className="space-y-4">
        <PageHeader title="Timetable Analytics" description="Figures and trends by semester, department, and building." actions={tabs} />
        <AdminPanels params={params} />
      </div>
    );
  }

  const [terms, departments] = await Promise.all([
    prisma.semester.findMany({ where: level ? { level } : {}, include: { academicYear: { select: { name: true } } }, orderBy: [{ startDate: "desc" }, { level: "asc" }] }),
    prisma.department.findMany({ where: departmentWhere.department(scope), orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const selectedTerm = terms.find((t) => t.id === params.term);
  const termIds = selectedTerm ? [selectedTerm.id] : terms.filter((t) => t.isActive).map((t) => t.id);
  // A Head of Department always sees their own department; the Registrar may pick one or see all.
  const departmentId = departments.some((d) => d.id === params.department) ? params.department! : scope.isAdmin ? null : scope.manageDepartmentId;
  const status = params.status === "ALL" ? "ALL" : SCHEDULE_STATES.includes(params.status as ScheduleState) ? params.status as ScheduleState : "PUBLISHED";

  const [scopedSchedules, rooms, faculty] = await Promise.all([
    prisma.schedule.findMany({
      where: { AND: [departmentWhere.schedule(scope), { semesterId: { in: termIds }, status: status === "ALL" ? { not: "ARCHIVED" } : status, section: { ...(departmentId ? { departmentId } : {}), ...(level ? { level } : {}) } }] },
      select: { id: true, roomId: true, facultyId: true, sectionId: true, status: true, dayOfWeek: true, startMin: true, endMin: true, semester: { select: { startDate: true, endDate: true } } },
    }),
    prisma.room.findMany({ where: { AND: [departmentWhere.room(scope), { archivedAt: null }] }, include: { availability: true, floor: { select: { building: { select: { id: true, name: true } } } } } }),
    prisma.faculty.findMany({ where: { AND: [departmentWhere.faculty(scope), { status: "ACTIVE", archivedAt: null, ...(departmentId ? { departmentId } : {}), ...(level ? { teachingLevels: { has: level } } : {}) }] }, include: { department: { select: { name: true } } } }),
  ]);
  const buildings = [...new Map(rooms.flatMap((room) => room.floor ? [[room.floor.building.id, room.floor.building] as const] : [])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const buildingId = buildings.some((building) => building.id === params.building) ? params.building! : "";
  const visibleRooms = rooms.filter((room) => !buildingId || room.floor?.building.id === buildingId);
  const buildingRoomIds = new Set(visibleRooms.map((room) => room.id));
  const schedules = scopedSchedules.filter((meeting) => !buildingId || buildingRoomIds.has(meeting.roomId ?? ""));

  // With a department filter, only rooms that department owns and shared rooms it uses are listed.
  const usedRooms = new Set(schedules.map((s) => s.roomId));
  const roomRows = roomUtilization(
    schedules,
    visibleRooms
      .filter((r) => !departmentId || r.departmentId === departmentId || (!r.departmentId && usedRooms.has(r.id)))
      .map((r) => ({
        id: r.id,
        name: roomLabel(r),
        building: r.floor?.building.name ?? "No building",
        availableHours: weeklyAvailableHours(r.availability, DEFAULT_ROOM_HOURS),
      }))
  );
  const facultyRows = facultyUtilization(
    schedules,
    faculty.map((f) => ({ id: f.id, name: f.fullName, department: f.department?.name ?? "No department", maxHours: f.maxHours }))
  );

  const termLabelOf = (t: (typeof terms)[number]) => `${levelLabel(t.level)} ${termLabel(t.type)} ${t.academicYear.name}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable Analytics"
        description="Understand the teaching week, review scheduling pressure, and turn findings into a focused schedule report."
        actions={tabs}
      />
      <AnalyticsCharts
        filters={{
          term: selectedTerm?.id ?? "",
          department: departmentId ?? "",
          building: buildingId,
          status,
          level: level ?? "",
          levels: ACADEMIC_LEVELS.map((value) => ({ value, label: levelLabel(value) })),
          terms: terms.map((t) => ({ value: t.id, label: termLabelOf(t) })),
          departments: departments.length > 1 || scope.isAdmin ? departments.map((d) => ({ value: d.id, label: d.name })) : [],
          allDepartments: scope.isAdmin,
          buildings: buildings.map((building) => ({ value: building.id, label: building.name })),
          departmentName: departments.find((d) => d.id === departmentId)?.name ?? "All departments",
          termName: selectedTerm ? termLabelOf(selectedTerm) : "All active terms",
        }}
        meetings={schedules.length}
        insights={scheduleInsights(schedules.map((meeting) => ({ ...meeting, termStart: isoDate(meeting.semester.startDate), termEnd: isoDate(meeting.semester.endDate) })))}
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
