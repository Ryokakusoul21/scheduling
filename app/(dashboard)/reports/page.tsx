import { roomLabel } from "@/lib/rooms/label";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { isoDate } from "@/lib/occupancy/engine";
import { DEFAULT_LEVEL, LevelTabs } from "@/components/academics/level-tabs";
import { isAcademicLevel } from "@/lib/academics/levels";
import { ScheduleReportTable } from "./report-table";
import { PageHeader } from "@/components/ux/states";
import { SCHEDULE_STATES, type ScheduleState } from "@/lib/analytics/schedule-insights";
import { deliveryMode } from "@/lib/suspensions/continuity";

export const metadata = { title: "Schedule Reports · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  // Levels are never combined: a report covers exactly one academic level.
  const level = isAcademicLevel(params.level) ? params.level : DEFAULT_LEVEL;
  // A Head of Department's report covers their own department only.
  const scope = await requireScope("SUPER_ADMINISTRATOR", "REGISTRAR", "HEAD_OF_DEPARTMENT");

  const [schedules, semesters, sections, faculty, rooms, departments, activities, suspensions] = await Promise.all([
    prisma.schedule.findMany({
      where: { AND: [{ status: { not: "ARCHIVED" }, section: { level } }, departmentWhere.schedule(scope)] },
      include: {
        semester: { include: { academicYear: true } },
        subject: true,
        section: true,
        faculty: true,
        room: true,
      },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
    }),
    prisma.semester.findMany({ where: { level }, include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.section.findMany({ where: { AND: [{ level }, departmentWhere.section(scope)] }, orderBy: { name: "asc" } }),
    prisma.faculty.findMany({ where: { AND: [{ teachingLevels: { has: level } }, departmentWhere.faculty(scope)] }, orderBy: { fullName: "asc" } }),
    prisma.room.findMany({ where: departmentWhere.room(scope), include: { floor: { select: { building: { select: { id: true, name: true } } } } }, orderBy: { roomNumber: "asc" } }),
    prisma.department.findMany({ where: departmentWhere.department(scope), orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Only approved activities belong in an official report.
    prisma.activity.findMany({
      where: { AND: [{ status: "APPROVED", OR: [{ level }, { level: null }] }, { OR: [departmentWhere.activity(scope), { departmentId: null }] }] },
      include: { department: { select: { name: true } }, room: { select: { roomNumber: true, roomName: true } }, batch: { select: { adjustments: { select: { scheduleId: true } } } } },
      orderBy: [{ startDate: "asc" }, { startMin: "asc" }],
    }),
    prisma.classSuspension.findMany({
      where: { status: "ACTIVE", OR: [{ level }, { level: null }], ...(!scope.isAdmin ? { AND: [{ OR: [{ departmentId: null }, { departmentId: { in: scope.departmentIds } }] }] } : {}) },
      include: { department: { select: { name: true } }, batch: { select: { adjustments: { select: { kind: true, scheduleId: true } }, activity: { select: { location: true } } } } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const buildings = [...new Map(rooms.flatMap((room) => room.floor ? [[room.floor.building.id, room.floor.building] as const] : [])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const initialFilters = {
    term: semesters.some((term) => term.id === params.term) ? params.term! : "ALL",
    department: departments.some((department) => department.id === params.department) ? params.department! : "ALL",
    status: params.status === "ALL" ? "ALL" : SCHEDULE_STATES.includes(params.status as ScheduleState) ? params.status! : "PUBLISHED",
    building: buildings.some((building) => building.id === params.building) ? params.building! : "ALL",
  };
  // Restrict suspension targets to sections visible in this report, including school-wide orders.
  const reportSuspensions = suspensions.flatMap((order) => {
    const targets = sections.filter((section) => (!order.departmentId || order.departmentId === section.departmentId) && (!order.sectionIds.length || order.sectionIds.includes(section.id)));
    return targets.length ? [{
      id: `suspension:${order.id}`, type: deliveryMode(order.batch?.adjustments ?? []) === "VIRTUAL" ? "SCHOOL_EVENT" : "CLASS_SUSPENSION", title: deliveryMode(order.batch?.adjustments ?? []) === "VIRTUAL" ? `Virtual class: ${order.title}` : order.title, description: order.reason,
      startDate: isoDate(order.startDate), endDate: isoDate(order.endDate), startMin: order.startMin, endMin: order.endMin,
      departmentId: order.departmentId, department: order.department?.name ?? "", level: order.level,
      location: order.batch?.activity?.location ?? "", sectionIds: targets.map((section) => section.id), scheduleIds: [...new Set(order.batch?.adjustments.map((item) => item.scheduleId) ?? [])],
    }] : [];
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Schedule Reports" description="Build a class register and export it." />

      <LevelTabs basePath="/reports" active={level} params={params} />

      <ScheduleReportTable
        key={`${level}|${initialFilters.term}|${initialFilters.department}|${initialFilters.status}|${initialFilters.building}`}
        activeLevel={level}
        initialFilters={initialFilters}
        rows={schedules.map((s) => ({
          id: s.id,
          semesterLabel: `${s.semester.academicYear.name} · ${s.semester.name}`,
          semesterId: s.semesterId,
          termStart: isoDate(s.semester.startDate),
          termEnd: isoDate(s.semester.endDate),
          subjectLabel: `${s.subject.code} — ${s.subject.name}`,
          sectionLabel: s.section.name,
          sectionId: s.sectionId,
          departmentId: s.section.departmentId ?? null,
          level: s.section.level,
          facultyLabel: s.faculty.fullName,
          facultyId: s.facultyId,
          roomLabel: (roomLabel(s.room) || "Online (live)"),
          roomId: s.roomId ?? "",
          buildingId: rooms.find((room) => room.id === s.roomId)?.floor?.building.id ?? null,
          dayOfWeek: s.dayOfWeek,
          startMin: s.startMin,
          endMin: s.endMin,
          status: s.status,
        }))}
        activities={[...activities.filter((activity) => !activity.batchId || !suspensions.some((order) => order.batchId === activity.batchId)).map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          description: a.description ?? "",
          startDate: isoDate(a.startDate),
          endDate: isoDate(a.endDate),
          startMin: a.startMin,
          endMin: a.endMin,
          departmentId: a.departmentId,
          department: a.department?.name ?? "",
          level: a.level,
          location: [roomLabel(a.room), a.location].filter(Boolean).join(", "),
          sectionIds: a.sectionIds,
          scheduleIds: [...new Set(a.batch?.adjustments.map((item) => item.scheduleId) ?? [])],
        })), ...reportSuspensions]}
        semesters={semesters.map((s) => ({ id: s.id, label: `${s.academicYear.name} · ${s.name}`, start: isoDate(s.startDate), end: isoDate(s.endDate) }))}
        departments={departments.map((d) => ({ id: d.id, label: d.name }))}
        sections={sections.map((s) => ({ id: s.id, label: s.name }))}
        faculty={faculty.map((f) => ({ id: f.id, label: f.fullName }))}
        rooms={rooms.map((r) => ({ id: r.id, label: roomLabel(r) }))}
        buildings={buildings.map((building) => ({ id: building.id, label: building.name }))}
      />
    </div>
  );
}
