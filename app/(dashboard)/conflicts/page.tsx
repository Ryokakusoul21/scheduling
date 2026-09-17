import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { detectConflicts } from "@/lib/scheduler/conflictDetector";
import { toSchedEntry, toSchedFaculty, toSchedRoom, toSchedSubject } from "@/lib/scheduler/mappers";
import { ConflictsList } from "./conflicts-list";

export const metadata = { title: "Conflict Resolution · GCST Scheduling" };

export default async function ConflictsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER");

  const [schedules, faculty, rooms, subjects, sections] = await Promise.all([
    prisma.schedule.findMany({
      where: { status: { not: "ARCHIVED" } },
      include: { subject: true, section: true, faculty: true, room: true },
    }),
    prisma.faculty.findMany({ include: { availability: true } }),
    prisma.room.findMany({ include: { availability: true } }),
    prisma.subject.findMany(),
    prisma.section.findMany(),
  ]);

  const entries = schedules.map(toSchedEntry);
  const conflicts = detectConflicts(entries, {
    facultyById: new Map(faculty.map((f) => [f.id, toSchedFaculty(f)])),
    roomById: new Map(rooms.map((r) => [r.id, toSchedRoom(r)])),
    subjectById: new Map(subjects.map((s) => [s.id, toSchedSubject(s)])),
    sectionStudentCountById: new Map(sections.map((s) => [s.id, s.studentCount])),
  });

  const scheduleById = new Map(
    schedules.map((s) => [
      s.id,
      {
        subjectLabel: `${s.subject.code} — ${s.subject.name}`,
        sectionLabel: s.section.name,
        facultyLabel: s.faculty.fullName,
        roomLabel: s.room.roomName,
        dayOfWeek: s.dayOfWeek,
        startMin: s.startMin,
        endMin: s.endMin,
      },
    ])
  );

  const rows = conflicts.map((c, i) => ({
    key: `${c.type}-${i}`,
    type: c.type,
    severity: c.severity,
    description: c.description,
    entryAId: c.entryA.id!,
    entryA: scheduleById.get(c.entryA.id!)!,
    entryB: c.entryB?.id ? scheduleById.get(c.entryB.id) : undefined,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conflict Resolution</h1>
        <p className="text-sm text-muted-foreground">
          Live-detected conflicts across every non-archived schedule entry ({entries.length} entries scanned).
        </p>
      </div>

      <ConflictsList rows={rows} />
    </div>
  );
}
