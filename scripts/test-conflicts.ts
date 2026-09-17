import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { detectConflicts } from "../lib/scheduler/conflictDetector";
import { toSchedEntry, toSchedFaculty, toSchedRoom, toSchedSubject } from "../lib/scheduler/mappers";

async function main() {
  const [schedules, faculty, rooms, subjects, sections] = await Promise.all([
    prisma.schedule.findMany(),
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

  console.log(`Checked ${entries.length} persisted schedule entries.`);
  console.log(`Conflicts found: ${conflicts.length}`);
  if (conflicts.length > 0) console.log(JSON.stringify(conflicts.slice(0, 10), null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
