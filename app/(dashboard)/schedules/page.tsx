import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { SchedulesTable } from "@/components/scheduler/schedules-table";

export const metadata = { title: "Schedule Manager · GCST Scheduling" };

export default async function SchedulesPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER");

  const [schedules, semesters, sections, subjects, faculty, rooms] = await Promise.all([
    prisma.schedule.findMany({
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
    prisma.subject.findMany({ orderBy: { code: "asc" } }),
    prisma.faculty.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
    prisma.room.findMany({ orderBy: { roomName: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule Manager</h1>
        <p className="text-sm text-muted-foreground">
          View, edit, publish, and manage every generated and manually created class schedule.
        </p>
      </div>

      <SchedulesTable
        schedules={schedules.map((s) => ({
          id: s.id,
          semesterId: s.semesterId,
          semesterLabel: `${s.semester.academicYear.name} · ${s.semester.name}`,
          subjectId: s.subjectId,
          subjectLabel: `${s.subject.code} — ${s.subject.name}`,
          sectionId: s.sectionId,
          sectionLabel: s.section.name,
          facultyId: s.facultyId,
          facultyLabel: s.faculty.fullName,
          roomId: s.roomId,
          roomLabel: s.room.roomName,
          component: s.component,
          dayOfWeek: s.dayOfWeek,
          startMin: s.startMin,
          endMin: s.endMin,
          status: s.status,
          version: s.version,
        }))}
        semesters={semesters.map((s) => ({ id: s.id, label: `${s.academicYear.name} · ${s.name}` }))}
        sections={sections.map((s) => ({ id: s.id, label: s.name }))}
        subjects={subjects.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}`, component: s.lectureHours > 0 ? "LECTURE" : "LABORATORY" }))}
        faculty={faculty.map((f) => ({ id: f.id, label: f.fullName }))}
        rooms={rooms.map((r) => ({ id: r.id, label: r.roomName }))}
      />
    </div>
  );
}
