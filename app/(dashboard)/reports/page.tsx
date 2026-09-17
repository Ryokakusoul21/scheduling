import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { ScheduleReportTable } from "./report-table";

export const metadata = { title: "Schedule Reports · GCST Scheduling" };

export default async function ReportsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER");

  const [schedules, semesters, sections, faculty, rooms] = await Promise.all([
    prisma.schedule.findMany({
      where: { status: { not: "ARCHIVED" } },
      include: {
        semester: { include: { academicYear: true } },
        subject: true,
        section: true,
        faculty: true,
        room: true,
      },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
    }),
    prisma.semester.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.section.findMany({ orderBy: { name: "asc" } }),
    prisma.faculty.findMany({ orderBy: { fullName: "asc" } }),
    prisma.room.findMany({ orderBy: { roomName: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule Reports</h1>
        <p className="text-sm text-muted-foreground">
          Granby Colleges of Science &amp; Technology — Class Schedule Report
        </p>
      </div>

      <ScheduleReportTable
        rows={schedules.map((s) => ({
          id: s.id,
          semesterLabel: `${s.semester.academicYear.name} · ${s.semester.name}`,
          semesterId: s.semesterId,
          subjectLabel: `${s.subject.code} — ${s.subject.name}`,
          sectionLabel: s.section.name,
          sectionId: s.sectionId,
          facultyLabel: s.faculty.fullName,
          facultyId: s.facultyId,
          roomLabel: s.room.roomName,
          roomId: s.roomId,
          dayOfWeek: s.dayOfWeek,
          startMin: s.startMin,
          endMin: s.endMin,
          status: s.status,
        }))}
        semesters={semesters.map((s) => ({ id: s.id, label: `${s.academicYear.name} · ${s.name}` }))}
        sections={sections.map((s) => ({ id: s.id, label: s.name }))}
        faculty={faculty.map((f) => ({ id: f.id, label: f.fullName }))}
        rooms={rooms.map((r) => ({ id: r.id, label: r.roomName }))}
      />
    </div>
  );
}
