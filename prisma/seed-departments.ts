/**
 * Add-only sample data for every non-computing department that has its own rooms: faculty, subjects, sections,
 * classes, subject assignments, and a Head of Department login. Safe to run again; existing records are kept.
 * Run: `npm run seed:departments`.
 */
import "dotenv/config";
import { PrismaClient, type DayOfWeek, type Faculty, type FacultyAvailability, type Room } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { DEPARTMENT_PLANS, FIRST_NAMES, LAST_NAMES, type DeptPlan } from "./data/department-seed-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const DEV_PASSWORD = "Passw0rd!";
const BASIC_LEVEL_DEPARTMENTS = { JUNIOR_HIGH: "JHS", ELEMENTARY: "ELEM", PRE_ELEMENTARY: "PRE-ELEM" } as const;

type Busy = { day: DayOfWeek; start: number; end: number };
type Teacher = Faculty & { availability: FacultyAvailability[]; load: number };

const COLLEGE_PATTERNS: DayOfWeek[][] = [["MONDAY", "WEDNESDAY"], ["TUESDAY", "THURSDAY"], ["WEDNESDAY", "FRIDAY"], ["MONDAY", "THURSDAY"]];
const WEEKDAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
// Every three-weekday combination, so small basic-education room pools fill without gaps.
const BASIC_PATTERNS = WEEKDAYS.flatMap((a, i) => WEEKDAYS.slice(i + 1).flatMap((b, j) => WEEKDAYS.slice(i + j + 2).map((c) => [a, b, c])));
const startTimes = (from: number, to: number) => Array.from({ length: (to - from) / 30 + 1 }, (_, i) => from + i * 30);

/** Moves elementary, junior high, and pre-elementary subjects and sections from Basic Education into their level departments. */
async function alignLevelDepartments(dept: Record<string, string>) {
  for (const [level, code] of Object.entries(BASIC_LEVEL_DEPARTMENTS)) {
    const where = { level: level as keyof typeof BASIC_LEVEL_DEPARTMENTS, departmentId: dept.BED };
    const moved = await prisma.subject.updateMany({ where, data: { departmentId: dept[code] } });
    const sections = await prisma.section.updateMany({ where, data: { departmentId: dept[code] } });
    console.log(`${code}: moved ${moved.count} subjects, ${sections.count} sections from Basic Education`);
  }
}

/** Creates missing faculty, subjects, and sections; returns the department's active teachers. */
async function upsertRecords(plan: DeptPlan, departmentId: string, nameIndex: { n: number }) {
  if (plan.moveFaculty) await prisma.faculty.updateMany({ where: { employeeId: { in: plan.moveFaculty } }, data: { departmentId } });
  for (let i = 1; i <= plan.newFaculty; i++) {
    const employeeId = `GC-${plan.code}-${String(i).padStart(3, "0")}`;
    if (await prisma.faculty.findUnique({ where: { employeeId } })) continue;
    const k = nameIndex.n++;
    const first = FIRST_NAMES[k % FIRST_NAMES.length], last = LAST_NAMES[(k * 7 + Math.floor(k / FIRST_NAMES.length)) % LAST_NAMES.length];
    const email = `${first}.${last}.${plan.code}`.toLowerCase().replace(/[^a-z.-]/g, "") + "@granby.edu.ph";
    await prisma.faculty.create({
      data: { employeeId, fullName: `${first} ${last}`, email, position: i === 1 ? "Assistant Professor" : "Instructor", teachingLevels: [plan.level], departmentId },
    });
  }

  const programs = new Map((await prisma.program.findMany()).map((p) => [p.code, p.id]));
  for (const [i, sub] of plan.subjects.entries()) {
    const data = {
      name: sub.name, units: 3, lectureHours: 3, level: plan.level, yearLevel: sub.year, gradeLevel: sub.grade, sortOrder: 100 + i,
      semester: plan.level === "COLLEGE" ? ("FIRST" as const) : undefined, programId: sub.program ? programs.get(sub.program) : undefined, departmentId,
    };
    const existing = await prisma.subject.findUnique({ where: { code: sub.code } });
    if (!existing) await prisma.subject.create({ data: { code: sub.code, ...data } });
    else if (existing.departmentId === departmentId) await prisma.subject.update({ where: { id: existing.id }, data: { name: sub.name } });
  }

  const term = await activeTerm(plan.level);
  for (const [i, sec] of plan.sections.entries()) {
    const found = await prisma.section.findFirst({ where: { name: sec.name, archivedAt: null } });
    const data = {
      level: plan.level, yearLevel: sec.year, gradeLevel: sec.grade, studentCount: sec.students, sortOrder: 100 + i, departmentId,
      programId: sec.program ? programs.get(sec.program) : undefined, semesterId: plan.level === "COLLEGE" ? term.id : undefined,
    };
    if (found) await prisma.section.update({ where: { id: found.id }, data: { studentCount: Math.min(found.studentCount, sec.students) } });
    else await prisma.section.create({ data: { name: sec.name, ...data } });
  }

  const teachers = await prisma.faculty.findMany({
    where: { departmentId, status: "ACTIVE", archivedAt: null, teachingLevels: { has: plan.level } }, include: { availability: true },
  });
  return { term, teachers };
}

async function activeTerm(level: DeptPlan["level"]) {
  return prisma.semester.findFirstOrThrow({ where: { level, isActive: true, programId: null }, orderBy: { startDate: "desc" } });
}

/** Places each section's subjects without double-booking any room, faculty member, or section; department rooms first, then shared ones. */
async function placeClasses(plan: DeptPlan, departmentId: string, termId: string, teachers: Teacher[]) {
  const term = await prisma.semester.findUniqueOrThrow({ where: { id: termId } });
  const [rooms, existing, sections, subjects] = await Promise.all([
    prisma.room.findMany({ where: { archivedAt: null, status: "AVAILABLE", OR: [{ departmentId }, { departmentId: null }] }, orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }] }),
    prisma.schedule.findMany({ where: { semester: { startDate: { lte: term.endDate }, endDate: { gte: term.startDate } } } }),
    prisma.section.findMany({ where: { departmentId, archivedAt: null, name: { in: plan.sections.map((x) => x.name) } } }),
    prisma.subject.findMany(),
  ]);
  const own = (r: Room) => (r.departmentId === departmentId ? 0 : 1);
  rooms.sort((a, b) => own(a) - own(b));
  const byCode = new Map(subjects.map((x) => [x.code, x]));
  const busy = new Map<string, Busy[]>();
  const occupy = (key: string, day: DayOfWeek, start: number, end: number) => busy.set(key, [...(busy.get(key) ?? []), { day, start, end }]);
  const isFree = (key: string, day: DayOfWeek, start: number, end: number) => !(busy.get(key) ?? []).some((b) => b.day === day && b.start < end && start < b.end);
  for (const x of existing) for (const key of [`s:${x.sectionId}`, `f:${x.facultyId}`, `r:${x.roomId}`]) occupy(key, x.dayOfWeek, x.startMin, x.endMin);
  for (const t of teachers) t.load = existing.filter((x) => x.facultyId === t.id).reduce((sum, x) => sum + (x.endMin - x.startMin), 0);
  const scheduled = new Set(existing.filter((x) => x.semesterId === termId).map((x) => `${x.sectionId}|${x.subjectId}`));

  const college = plan.level === "COLLEGE";
  const patterns = college ? COLLEGE_PATTERNS : BASIC_PATTERNS;
  const minutes = college ? 90 : 60;
  const times = college ? startTimes(450, 990) : startTimes(420, 960);
  const created: { sectionId: string; subjectId: string; facultyId: string; roomId: string; day: DayOfWeek; start: number; end: number }[] = [];
  let skipped = 0;

  plan.sections.forEach((secPlan, si) => {
    const section = sections.find((x) => x.name === secPlan.name);
    if (!section) return;
    for (const [ci, code] of secPlan.subjects.entries()) {
      const subject = byCode.get(code);
      if (!subject || scheduled.has(`${section.id}|${subject.id}`)) continue;
      const pool = rooms.filter((r) => r.roomType === subject.requiredRoomType && r.capacity >= section.studentCount);
      const placed = [...teachers].sort((a, b) => a.load - b.load).some((teacher) => {
        if (teacher.load + minutes * patterns[0].length > teacher.maxHours * 60) return false;
        const available = (d: DayOfWeek, s: number, e: number) => teacher.availability.length === 0 || teacher.availability.some((w) => w.dayOfWeek === d && s >= w.startMin && e <= w.endMin);
        const commit = (picks: { d: DayOfWeek; start: number; room: Room }[]) => {
          for (const { d, start, room } of picks) {
            for (const key of [`s:${section.id}`, `f:${teacher.id}`, `r:${room.id}`]) occupy(key, d, start, start + minutes);
            created.push({ sectionId: section.id, subjectId: subject.id, facultyId: teacher.id, roomId: room.id, day: d, start, end: start + minutes });
          }
          teacher.load += minutes * picks.length;
          return true;
        };
        // Basic education: each weekly meeting takes its own free slot, so a few homerooms pack fully.
        if (!college) {
          const picks: { d: DayOfWeek; start: number; room: Room }[] = [];
          for (const d of WEEKDAYS.map((_, k) => WEEKDAYS[(k + si + ci) % WEEKDAYS.length])) {
            for (const start of times) {
              const end = start + minutes;
              if (!isFree(`s:${section.id}`, d, start, end) || !isFree(`f:${teacher.id}`, d, start, end) || !available(d, start, end)) continue;
              const room = pool.find((r) => isFree(`r:${r.id}`, d, start, end));
              if (room) { picks.push({ d, start, room }); break; }
            }
            if (picks.length === patterns[0].length) return commit(picks);
          }
          return false;
        }
        for (let p = 0; p < patterns.length; p++) {
          const days = patterns[(p + si + ci) % patterns.length];
          for (const start of times) {
            const end = start + minutes;
            if (!days.every((d) => isFree(`s:${section.id}`, d, start, end) && isFree(`f:${teacher.id}`, d, start, end) && available(d, start, end))) continue;
            const room = pool.find((r) => days.every((d) => isFree(`r:${r.id}`, d, start, end)));
            if (room) return commit(days.map((d) => ({ d, start, room })));
          }
        }
        return false;
      });
      if (!placed) { skipped++; console.warn(`  Could not place ${code} for ${secPlan.name}`); }
    }
  });

  await prisma.schedule.createMany({
    data: created.map((c) => ({
      semesterId: termId, sectionId: c.sectionId, subjectId: c.subjectId, facultyId: c.facultyId, roomId: c.roomId, departmentId,
      component: "LECTURE" as const, dayOfWeek: c.day, startMin: c.start, endMin: c.end, status: "PUBLISHED" as const, generatedBy: "SEED",
    })),
  });
  const pairs = [...new Map(created.map((c) => [`${c.sectionId}|${c.subjectId}`, c])).values()];
  await prisma.subjectAssignment.createMany({ data: pairs.map((c) => ({ subjectId: c.subjectId, sectionId: c.sectionId, facultyId: c.facultyId, semesterId: termId })) });
  return { meetings: created.length, classes: pairs.length, skipped };
}

/** Creates the department's Head of Department login when the faculty member has none. */
async function ensureHead(plan: DeptPlan, departmentId: string, passwordHash: string) {
  const faculty = await prisma.faculty.findUnique({ where: { employeeId: plan.head.employeeId }, include: { user: true } });
  if (!faculty || faculty.user || (await prisma.user.findUnique({ where: { email: plan.head.email } }))) return;
  const user = await prisma.user.create({
    data: { email: plan.head.email, name: faculty.fullName, role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", emailVerified: new Date(), termsAcceptedAt: new Date(), passwordHash, facultyId: faculty.id },
  });
  await prisma.userDepartmentAssignment.create({ data: { userId: user.id, departmentId } });
  console.log(`  Head of Department login: ${plan.head.email}`);
}

async function main() {
  const dept = Object.fromEntries((await prisma.department.findMany()).map((d) => [d.code, d.id]));
  await alignLevelDepartments(dept);
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  // Continue after faculty created by earlier runs so names never repeat.
  const nameIndex = { n: await prisma.faculty.count({ where: { OR: DEPARTMENT_PLANS.map((p) => ({ employeeId: { startsWith: `GC-${p.code}-` } })) } }) };
  for (const plan of DEPARTMENT_PLANS) {
    const departmentId = dept[plan.code];
    if (!departmentId || (await prisma.room.count({ where: { departmentId, archivedAt: null } })) === 0) { console.log(`${plan.code}: skipped (no rooms)`); continue; }
    const { term, teachers } = await upsertRecords(plan, departmentId, nameIndex);
    const result = await placeClasses(plan, departmentId, term.id, teachers.map((t) => ({ ...t, load: 0 })));
    console.log(`${plan.code}: ${teachers.length} faculty, ${result.classes} classes (${result.meetings} meetings) in ${term.name}, ${result.skipped} not placed`);
    await ensureHead(plan, departmentId, passwordHash);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
