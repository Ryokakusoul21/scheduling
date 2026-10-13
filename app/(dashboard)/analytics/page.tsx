import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { byGroup, facultyUtilization, overall, peakHeatmap, roomUtilization } from "@/lib/analytics/timetable";
import { PageHeader } from "@/components/ux/states";
import { AnalyticsCharts } from "./analytics-charts";

export const metadata = { title: "Timetable Analytics · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

/** Weekly hours a room can be used when it has no availability windows: Monday to Saturday, 7:00 AM to 7:00 PM. */
const DEFAULT_ROOM_HOURS = 6 * 12;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ term?: string; department?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const params = await searchParams;

  const [terms, departments] = await Promise.all([
    prisma.semester.findMany({ include: { academicYear: { select: { name: true } } }, orderBy: [{ startDate: "desc" }, { level: "asc" }] }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const selectedTerm = terms.find((t) => t.id === params.term);
  const termIds = selectedTerm ? [selectedTerm.id] : terms.filter((t) => t.isActive).map((t) => t.id);
  // A Head of Department always sees their own department; the Administrator may pick one or see all.
  const departmentId = scope.isAdmin ? (departments.some((d) => d.id === params.department) ? params.department! : null) : scope.departmentId;

  const [schedules, rooms, faculty] = await Promise.all([
    prisma.schedule.findMany({
      where: { semesterId: { in: termIds }, status: { not: "ARCHIVED" }, ...(departmentId ? { section: { program: { departmentId } } } : {}) },
      select: { roomId: true, facultyId: true, dayOfWeek: true, startMin: true, endMin: true },
    }),
    prisma.room.findMany({ include: { availability: true, floor: { select: { building: { select: { name: true } } } } } }),
    prisma.faculty.findMany({ where: { status: "ACTIVE", ...(departmentId ? { departmentId } : {}) }, include: { department: { select: { name: true } } } }),
  ]);

  // With a department filter, only rooms that department owns or uses are listed.
  const usedRooms = new Set(schedules.map((s) => s.roomId));
  const roomRows = roomUtilization(
    schedules,
    rooms
      .filter((r) => !departmentId || r.departmentId === departmentId || usedRooms.has(r.id))
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
    </div>
  );
}
