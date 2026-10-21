import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { isoDate } from "@/lib/occupancy/engine";
import { ScheduleReportTable } from "./report-table";

export const metadata = { title: "Schedule Reports · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ReportsPage() {
  await requireRole("ADMINISTRATOR", "HEAD_OF_DEPARTMENT");

  const [schedules, semesters, sections, faculty, rooms, departments, activities] = await Promise.all([
    prisma.schedule.findMany({
      where: { status: { not: "ARCHIVED" } },
      include: {
        semester: { include: { academicYear: true } },
        subject: true,
        section: { include: { program: { select: { departmentId: true } } } },
        faculty: true,
        room: true,
      },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
    }),
    prisma.semester.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.section.findMany({ orderBy: { name: "asc" } }),
    prisma.faculty.findMany({ orderBy: { fullName: "asc" } }),
    prisma.room.findMany({ orderBy: { roomName: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Only approved activities belong in an official report.
    prisma.activity.findMany({
      where: { status: "APPROVED" },
      include: { department: { select: { name: true } }, room: { select: { roomName: true } } },
      orderBy: [{ startDate: "asc" }, { startMin: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule Reports</h1>
        <p className="text-sm text-muted-foreground">
          GRANBY COLLEGES OF SCIENCE &amp; TECHNOLOGY — Class Schedule Report
        </p>
      </div>

      <ScheduleReportTable
        rows={schedules.map((s) => ({
          id: s.id,
          semesterLabel: `${s.semester.academicYear.name} · ${s.semester.name}`,
          semesterId: s.semesterId,
          termStart: isoDate(s.semester.startDate),
          termEnd: isoDate(s.semester.endDate),
          subjectLabel: `${s.subject.code} — ${s.subject.name}`,
          sectionLabel: s.section.name,
          sectionId: s.sectionId,
          departmentId: s.section.program?.departmentId ?? null,
          level: s.section.level,
          facultyLabel: s.faculty.fullName,
          facultyId: s.facultyId,
          roomLabel: s.room.roomName,
          roomId: s.roomId,
          dayOfWeek: s.dayOfWeek,
          startMin: s.startMin,
          endMin: s.endMin,
          status: s.status,
        }))}
        activities={activities.map((a) => ({
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
          location: [a.room?.roomName, a.location].filter(Boolean).join(", "),
          sectionIds: a.sectionIds,
        }))}
        semesters={semesters.map((s) => ({ id: s.id, label: `${s.academicYear.name} · ${s.name}`, start: isoDate(s.startDate), end: isoDate(s.endDate) }))}
        departments={departments.map((d) => ({ id: d.id, label: d.name }))}
        sections={sections.map((s) => ({ id: s.id, label: s.name }))}
        faculty={faculty.map((f) => ({ id: f.id, label: f.fullName }))}
        rooms={rooms.map((r) => ({ id: r.id, label: r.roomName }))}
      />
    </div>
  );
}
