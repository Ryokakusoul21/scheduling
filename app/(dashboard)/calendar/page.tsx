import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { CalendarExplorer } from "./calendar-explorer";
import type { CalendarEntry } from "@/components/scheduler/weekly-calendar";

export const metadata = { title: "Schedule Calendar · GCST Scheduling" };

export default async function CalendarPage() {
  await requireUser();

  const semesters = await prisma.semester.findMany({
    include: { academicYear: true },
    orderBy: { startDate: "desc" },
  });
  const activeSemester = semesters.find((s) => s.isActive) ?? semesters[0];

  const [schedules, sections, faculty, rooms] = await Promise.all([
    prisma.schedule.findMany({
      where: { semesterId: activeSemester?.id, status: { not: "ARCHIVED" } },
      include: { subject: true, section: true, faculty: true, room: true },
    }),
    prisma.section.findMany({ where: { semesterId: activeSemester?.id }, orderBy: { name: "asc" } }),
    prisma.faculty.findMany({ orderBy: { fullName: "asc" } }),
    prisma.room.findMany({ orderBy: { roomName: "asc" } }),
  ]);

  const subjectColorIndex = new Map<string, number>();
  let next = 0;
  function colorFor(id: string) {
    if (!subjectColorIndex.has(id)) subjectColorIndex.set(id, next++);
    return subjectColorIndex.get(id)!;
  }

  const entries = schedules.map((s) => ({
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    startMin: s.startMin,
    endMin: s.endMin,
    subjectName: s.subject.name,
    subjectCode: s.subject.code,
    facultyName: s.faculty.fullName,
    roomName: s.room.roomName,
    colorIndex: colorFor(s.subjectId),
    sectionId: s.sectionId,
    facultyId: s.facultyId,
    roomId: s.roomId,
  })) satisfies (CalendarEntry & { sectionId: string; facultyId: string; roomId: string })[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule Calendar</h1>
        <p className="text-sm text-muted-foreground">
          {activeSemester ? `${activeSemester.academicYear.name} · ${activeSemester.name}` : "No semester scheduled yet."}
        </p>
      </div>

      <CalendarExplorer
        entries={entries}
        sections={sections.map((s) => ({ id: s.id, label: s.name }))}
        faculty={faculty.map((f) => ({ id: f.id, label: f.fullName }))}
        rooms={rooms.map((r) => ({ id: r.id, label: r.roomName }))}
      />
    </div>
  );
}
