/**
 * Adds sample history for trend comparisons without touching existing data: the previous college
 * semester with its own timetable, and past room bookings in both semesters. Bookings go through the
 * real planner, so classes in the booked rooms are rescheduled exactly as they would be live.
 * Safe to run more than once. Standalone: `npx tsx --conditions=react-server prisma/sample-history.ts`.
 */
import "dotenv/config";
import { PrismaClient, type Semester } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { addDays, dayOfWeek, isoDate } from "../lib/occupancy/engine";
import { applyPlan, planRoomBooking } from "../lib/occupancy/adjust";
import { placeCollegeClasses } from "./sample-timetable";

const PURPOSES = [
  "Department meeting", "Thesis defense", "Accreditation visit", "Guest lecture", "Faculty training",
  "Student council meeting", "Parent orientation", "Research colloquium", "Career talk", "Quiz bee practice",
];

const NOT_YET_OFFERED = ["Industrial Security Management 1-A", "Secondary Education 1-A"];

function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Books rooms on past weekdays of a term: about half over a class (resolved automatically), the rest in free rooms. */
async function pastBookings(db: PrismaClient, term: Semester, from: string, to: string, count: number, bookerIds: string[], rand: () => number) {
  if (from > to || (await db.roomBooking.count({ where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } } })) >= count) return 0;
  const span = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000;
  const halls = await db.room.findMany({ where: { roomType: { in: ["CONFERENCE_ROOM", "OTHER"] } } });
  let made = 0;
  for (let i = 0; i < count * 3 && made < count; i++) {
    let date = addDays(from, Math.floor(rand() * (span + 1)));
    while (["SATURDAY", "SUNDAY"].includes(dayOfWeek(date))) date = addDays(date, 1);
    if (date > to) continue;
    const purpose = PURPOSES[Math.floor(rand() * PURPOSES.length)];
    const overClass = rand() < 0.55;
    let req: { roomId: string; date: string; startMin: number; endMin: number; purpose: string };
    if (overClass) {
      const classes = await db.schedule.findMany({ where: { semesterId: term.id, dayOfWeek: dayOfWeek(date), component: "LECTURE" } });
      if (!classes.length) continue;
      const c = classes[Math.floor(rand() * classes.length)];
      req = { roomId: c.roomId, date, startMin: c.startMin, endMin: c.endMin, purpose };
    } else {
      const start = (8 + Math.floor(rand() * 8)) * 60;
      req = { roomId: halls[Math.floor(rand() * halls.length)].id, date, startMin: start, endMin: start + 120, purpose };
    }
    const plan = await planRoomBooking(req);
    if (plan.blockers.length) continue;
    const bookedById = bookerIds[Math.floor(rand() * bookerIds.length)];
    const batchId = plan.items.length ? await applyPlan(plan, "ROOM_BOOKING", `Room booked on ${date} for "${purpose}"`, bookedById) : null;
    await db.roomBooking.create({
      data: { roomId: req.roomId, bookedById, purpose, date: new Date(`${date}T00:00:00Z`), startMin: req.startMin, endMin: req.endMin, attendees: 20 + Math.floor(rand() * 20), batchId },
    });
    made++;
  }
  return made;
}

export async function addSampleHistory(db: PrismaClient) {
  const startedAt = new Date();
  const rand = random(1999);
  const ay = await db.academicYear.findFirst({ where: { isActive: true } });
  const current = await db.semester.findFirst({ where: { isActive: true, level: "COLLEGE", programId: null } });
  if (!ay || !current) return console.log("Sample history skipped: no active academic year or college term.");
  const year = Number(ay.name.slice(0, 4));

  // Previous college semester: the second semester of the previous academic year.
  const previousYear =
    (await db.academicYear.findFirst({ where: { name: `${year - 1}-${year}` } })) ??
    (await db.academicYear.create({ data: { name: `${year - 1}-${year}`, startDate: new Date(`${year - 1}-08-01T00:00:00Z`), endDate: new Date(`${year}-06-30T00:00:00Z`) } }));
  let previous = await db.semester.findFirst({ where: { academicYearId: previousYear.id, level: "COLLEGE", type: "SECOND", programId: null } });
  if (!previous) {
    previous = await db.semester.create({
      data: { academicYearId: previousYear.id, level: "COLLEGE", type: "SECOND", name: "Second Semester", startDate: new Date(`${year}-01-12T00:00:00Z`), endDate: new Date(`${year}-05-22T00:00:00Z`) },
    });
    // Same sections a semester earlier, a little smaller, taking the second-semester programming subject.
    const currentSections = await db.section.findMany({ where: { semesterId: current.id }, orderBy: { sortOrder: "asc" } });
    const subjectsOf = async (sectionId: string) =>
      [...new Set((await db.schedule.findMany({ where: { sectionId }, include: { subject: { select: { code: true } } } })).map((s) => s.subject.code))];
    const plans = [];
    // Two newer programs had not opened first-year sections yet, so the past semester is a little smaller.
    for (const s of currentSections.filter((x) => !NOT_YET_OFFERED.includes(x.name))) {
      const copy = await db.section.create({
        data: { name: s.name, level: s.level, yearLevel: s.yearLevel, programId: s.programId, semesterId: previous.id, studentCount: Math.round(s.studentCount * 0.94), sortOrder: s.sortOrder },
      });
      const subjects = (await subjectsOf(s.id)).map((c) => (c === "IT102" ? "IT103" : c));
      plans.push({ id: copy.id, name: copy.name, count: copy.studentCount, subjects });
    }
    const placed = await placeCollegeClasses(db, previous.id, plans);
    console.log(`Previous semester: ${placed} class meetings placed.`);
  }

  const bookers = (await db.user.findMany({ where: { role: { in: ["ADMINISTRATOR", "HEAD_OF_DEPARTMENT"] } }, select: { id: true } })).map((u) => u.id);
  const yesterday = addDays(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }), -1);
  const pastPrevious = await pastBookings(db, previous, isoDate(previous.startDate), [isoDate(previous.endDate), yesterday].sort()[0], 10, bookers, rand);
  const pastCurrent = await pastBookings(db, current, isoDate(current.startDate), [isoDate(current.endDate), yesterday].sort()[0], 12, bookers, rand);
  // Notifications about long-past changes are history, not news.
  await db.notification.updateMany({ where: { createdAt: { gte: startedAt } }, data: { isRead: true } });
  console.log(`Sample history: ${pastPrevious} past bookings in the previous semester, ${pastCurrent} in the current one.`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/sample-history.ts")) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  addSampleHistory(db)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
