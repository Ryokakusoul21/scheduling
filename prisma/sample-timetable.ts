/**
 * Sample college timetable generator shared by the seed and the sample history script.
 * Greedy placement that never double-books a room, faculty member, or section, and respects faculty
 * availability and meetings already scheduled in overlapping terms.
 */
import type { DayOfWeek, PrismaClient } from "@prisma/client";

export const TEACHER_FOR: Record<string, string[]> = {
  GE101: ["F-008", "F-014"], GE102: ["F-009", "F-013"], GE103: ["F-010"], GE104: ["F-009", "F-010", "F-013"],
  GRANBY100: ["F-010", "F-013"], IT101: ["F-001", "F-005"], IT102: ["F-001", "F-005"], IT103: ["F-001", "F-005"], IT201: ["F-005", "F-001"],
  IT202: ["F-003", "F-001"], IT203: ["F-004"], IT301: ["F-002"], IT302: ["F-007"], IT303: ["F-006"], IT401: ["F-007", "F-002"],
  CS201: ["F-014"], CS202: ["F-015"], SCI101: ["F-011"], CRIM101: ["F-016"], ACC101: ["F-017"], BA101: ["F-012"],
  TM101: ["F-018"], ISM101: ["F-016"], EED101: ["F-013"], ED101: ["F-013"],
};

/** Ana Santos gets extra laboratory sections on purpose so the workload engine has someone to rebalance. */
export const OVERLOAD_EXTRAS: Record<string, string> = { "Information Technology 2-B|IT201": "F-001", "Computer Science 2-A|IT201": "F-001" };

export interface SectionPlan {
  id: string;
  name: string;
  count: number;
  subjects: string[];
}

type Busy = { day: DayOfWeek; start: number; end: number };

const START_TIMES = Array.from({ length: 21 }, (_, i) => 7 * 60 + 30 + i * 30).filter((t) => t <= 17 * 60);
const DAY_PATTERNS: DayOfWeek[][] = [["MONDAY", "WEDNESDAY"], ["TUESDAY", "THURSDAY"], ["WEDNESDAY", "FRIDAY"], ["MONDAY", "THURSDAY"]];
const SINGLE_DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

/** Places every subject of every section in the term and saves the meetings as published classes. */
export async function placeCollegeClasses(db: PrismaClient, termId: string, plans: SectionPlan[]) {
  const term = await db.semester.findUniqueOrThrow({ where: { id: termId } });
  const [rooms, faculty, subjects, existing] = await Promise.all([
    db.room.findMany({ include: { department: { select: { code: true } } }, orderBy: { sortOrder: "asc" } }),
    db.faculty.findMany({ include: { availability: true } }),
    db.subject.findMany(),
    db.schedule.findMany({ where: { semester: { startDate: { lte: term.endDate }, endDate: { gte: term.startDate } } } }),
  ]);
  const byCode = new Map(subjects.map((s) => [s.code, s]));
  const byEmployee = new Map(faculty.map((f) => [f.employeeId, f]));

  const busy = new Map<string, Busy[]>();
  const occupy = (key: string, day: DayOfWeek, start: number, end: number) => busy.set(key, [...(busy.get(key) ?? []), { day, start, end }]);
  const isFree = (key: string, day: DayOfWeek, start: number, end: number) => !(busy.get(key) ?? []).some((b) => b.day === day && b.start < end && start < b.end);
  for (const s of existing) {
    occupy(`s:${s.sectionId}`, s.dayOfWeek, s.startMin, s.endMin);
    occupy(`f:${s.facultyId}`, s.dayOfWeek, s.startMin, s.endMin);
    occupy(`r:${s.roomId}`, s.dayOfWeek, s.startMin, s.endMin);
  }

  const created: { sectionId: string; subjectId: string; facultyId: string; roomId: string; day: DayOfWeek; start: number; end: number; lab: boolean }[] = [];

  function place(plan: SectionPlan, code: string, employeeId: string, lab: boolean, minutes: number, meetings: number, rotate: number) {
    const subject = byCode.get(code)!;
    const teacher = byEmployee.get(employeeId)!;
    const available = (day: DayOfWeek, start: number, end: number) =>
      teacher.availability.length === 0 || teacher.availability.some((w) => w.dayOfWeek === day && start >= w.startMin && end <= w.endMin);
    // College classes use shared rooms and their own laboratories, never Basic Education classrooms.
    const pool = rooms.filter((r) => (lab ? r.roomType === subject.requiredRoomType : r.roomType === "LECTURE_ROOM") && r.capacity >= plan.count && r.department?.code !== "BED");
    const patterns = meetings === 2 ? DAY_PATTERNS : SINGLE_DAYS.map((d) => [d]);
    for (let p = 0; p < patterns.length; p++) {
      const days = patterns[(p + rotate) % patterns.length];
      for (const start of START_TIMES) {
        const end = start + minutes;
        if (end > 18 * 60) continue;
        if (!days.every((d) => isFree(`s:${plan.id}`, d, start, end) && isFree(`f:${teacher.id}`, d, start, end) && available(d, start, end))) continue;
        const room = pool.find((r) => days.every((d) => isFree(`r:${r.id}`, d, start, end)));
        if (!room) continue;
        for (const d of days) {
          occupy(`s:${plan.id}`, d, start, end);
          occupy(`f:${teacher.id}`, d, start, end);
          occupy(`r:${room.id}`, d, start, end);
          created.push({ sectionId: plan.id, subjectId: subject.id, facultyId: teacher.id, roomId: room.id, day: d, start, end, lab });
        }
        return;
      }
    }
    console.warn(`Could not place ${code} for ${plan.name}`);
  }

  plans.forEach((plan, si) => {
    for (const code of plan.subjects) {
      const subject = byCode.get(code)!;
      const candidates = OVERLOAD_EXTRAS[`${plan.name}|${code}`] ? [OVERLOAD_EXTRAS[`${plan.name}|${code}`]] : TEACHER_FOR[code];
      const teacher = candidates[si % candidates.length];
      if (subject.lectureHours > 0) {
        const twice = subject.lectureHours === 3;
        place(plan, code, teacher, false, twice ? 90 : subject.lectureHours * 60, twice ? 2 : 1, si);
      }
      for (let k = 0; k < subject.labHours; k++) place(plan, code, teacher, true, 180, 1, si + k + 1);
    }
  });

  await db.schedule.createMany({
    data: created.map((c) => ({
      semesterId: termId, sectionId: c.sectionId, subjectId: c.subjectId, facultyId: c.facultyId, roomId: c.roomId,
      component: c.lab ? ("LABORATORY" as const) : ("LECTURE" as const), dayOfWeek: c.day, startMin: c.start, endMin: c.end, status: "PUBLISHED" as const,
    })),
  });
  return created.length;
}
