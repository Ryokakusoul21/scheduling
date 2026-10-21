/**
 * Sample data for the Archive and Activity Approvals features: archived accounts, subjects, rooms, and
 * sections, two more Heads of Department, and school activities submitted by several departments in
 * every approval state. Runs after the main seed and looks records up by their codes and emails.
 */
import type { ActivityStatus, PrismaClient } from "@prisma/client";
import { addDays, dayOfWeek } from "../lib/occupancy/engine";

const DAY_MS = 86_400_000;
const date = (s: string) => new Date(`${s}T00:00:00Z`);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** The first Monday-to-Friday date at least `days` from today. */
function weekday(days: number) {
  let d = addDays(today(), days);
  while (["SATURDAY", "SUNDAY"].includes(dayOfWeek(d))) d = addDays(d, 1);
  return d;
}

export async function addArchiveAndApprovalSamples(db: PrismaClient, passwordHash: string) {
  const dept = Object.fromEntries((await db.department.findMany()).map((d) => [d.code, d.id]));
  const room = Object.fromEntries((await db.room.findMany()).map((r) => [r.roomNumber, r.id]));
  const userId = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id;
  const facultyId = async (employeeId: string) => (await db.faculty.findUniqueOrThrow({ where: { employeeId } })).id;
  const adminId = await userId("administrator@granby.edu.ph");
  const account = { status: "ACTIVE" as const, emailVerified: new Date(), termsAcceptedAt: new Date(), passwordHash };

  // Two more Heads of Department so submissions come from several departments.
  await db.user.create({ data: { ...account, email: "head.business@granby.edu.ph", name: "Ricardo Lim", role: "HEAD_OF_DEPARTMENT", facultyId: await facultyId("F-012") } });
  await db.user.create({ data: { ...account, email: "head.artsciences@granby.edu.ph", name: "Daniel Ramos", role: "HEAD_OF_DEPARTMENT", facultyId: await facultyId("F-008") } });

  // -------------------------------------------------------------------
  // Archived records (new ones, so the seeded timetable stays complete)
  // -------------------------------------------------------------------
  const archived = (daysAgo: number, reason: string) => ({ archivedAt: new Date(Date.now() - daysAgo * DAY_MS), archivedById: adminId, archiveReason: reason });
  const audit = (action: string, entity: string, entityId: string, daysAgo: number, reason: string) =>
    db.auditLog.create({ data: { userId: adminId, action, entity, entityId, newValue: { reason }, createdAt: new Date(Date.now() - daysAgo * DAY_MS) } });

  const resigned = "Resigned at the end of the previous semester.";
  const lacson = await db.faculty.create({
    data: { employeeId: "F-019", fullName: "Rosario Lacson", email: "lacson@granby.edu.ph", departmentId: dept.CBA, position: "Instructor", specialization: "Marketing", maxHours: 24, ...archived(24, resigned) },
  });
  const lacsonUser = await db.user.create({ data: { ...account, email: "lacson@granby.edu.ph", name: "Rosario Lacson", role: "FACULTY", facultyId: lacson.id, ...archived(24, resigned) } });
  await audit('Archived user account "Rosario Lacson"', "User account", lacsonUser.id, 24, resigned);

  const retired = "Retired from the Registrar's Office.";
  const ventura = await db.user.create({ data: { ...account, email: "ventura@granby.edu.ph", name: "Helen Ventura", role: "ADMINISTRATOR", ...archived(40, retired) } });
  await audit('Archived user account "Helen Ventura"', "User account", ventura.id, 40, retired);

  const transferred = "Transferred to another school.";
  const itSection = await db.section.findFirstOrThrow({ where: { name: "Information Technology 1-B" } });
  const delaPaz = await db.user.create({
    data: { ...account, email: "student.transferred@granby.edu.ph", name: "Marco Dela Paz", role: "STUDENT", ...archived(9, transferred), student: { create: { studentNumber: "2026-00877", sectionId: itSection.id } } },
  });
  await audit('Archived user account "Marco Dela Paz"', "User account", delaPaz.id, 9, transferred);

  const replaced = "Replaced by Living in the Information Technology Era in the revised curriculum.";
  const oldSubject = await db.subject.create({
    data: { code: "IT099", name: "Computer Literacy", units: 3, lectureHours: 2, labHours: 1, requiredRoomType: "COMPUTER_LABORATORY", level: "COLLEGE", programId: itSection.programId, yearLevel: "FIRST", sortOrder: 999, ...archived(60, replaced) },
  });
  await audit('Archived subject "IT099"', "Subject", oldSubject.id, 60, replaced);

  const storage = "Converted into a storage room for the library.";
  const thirdFloor = await db.floor.findFirstOrThrow({ where: { name: "Third Floor", building: { name: "Main Building" } } });
  const oldRoom = await db.room.create({
    data: { roomNumber: "304", roomName: "Room 304", floorId: thirdFloor.id, sortOrder: 999, capacity: 30, roomType: "LECTURE_ROOM", equipment: ["Whiteboard"], ...archived(15, storage) },
  });
  await audit('Archived room "Room 304"', "Room", oldRoom.id, 15, storage);

  const merged = "Merged with Information Technology 1-A because of low enrollment.";
  const oldSection = await db.section.create({
    data: { name: "Information Technology 1-C", level: "COLLEGE", yearLevel: "FIRST", programId: itSection.programId, semesterId: itSection.semesterId, studentCount: 12, sortOrder: 999, ...archived(5, merged) },
  });
  await audit('Archived section "Information Technology 1-C"', "Section", oldSection.id, 5, merged);

  // -------------------------------------------------------------------
  // Activities submitted by departments, in every approval state
  // -------------------------------------------------------------------
  const heads = {
    CCS: await userId("head.computing@granby.edu.ph"),
    BED: await userId("head.basiceducation@granby.edu.ph"),
    CBA: await userId("head.business@granby.edu.ph"),
    CAS: await userId("head.artsciences@granby.edu.ph"),
  };
  type Submission = {
    dept: keyof typeof heads; title: string; description: string; start: string; end?: string; from?: number; to?: number;
    level?: "COLLEGE" | "SENIOR_HIGH" | "JUNIOR_HIGH" | "ELEMENTARY"; room?: string; location?: string; participants: string;
    status: ActivityStatus; note?: string; daysAgo: number;
  };
  const submissions: Submission[] = [
    {
      dept: "CCS", title: "Intercollegiate Programming Contest", description: "Team programming contest with three hosted schools.", start: weekday(3), from: 13 * 60, to: 17 * 60,
      level: "COLLEGE", room: "1101", participants: "Information Technology and Computer Science students; 12 teams", status: "PENDING", daysAgo: 1,
    },
    {
      dept: "CCS", title: "Cybersecurity Awareness Seminar", description: "Guest speakers from the regional cybercrime office.", start: weekday(8), from: 10 * 60, to: 12 * 60,
      level: "COLLEGE", room: "4102", participants: "All second-year college students", status: "CHANGES_REQUESTED", note: "Move it after 3:00 PM so second-year classes are not affected.", daysAgo: 3,
    },
    {
      dept: "BED", title: "Junior High School Science Fair", description: "Investigatory project exhibits and judging.", start: weekday(6),
      level: "JUNIOR_HIGH", location: "Gymnasium", participants: "Grades 7 to 10 students and science teachers", status: "PENDING", daysAgo: 2,
    },
    {
      dept: "BED", title: "Elementary Parent-Teacher Conference", description: "First quarter report card distribution.", start: weekday(10), from: 8 * 60, to: 12 * 60,
      level: "ELEMENTARY", room: "3101", participants: "Parents and advisers of Kindergarten to Grade 6", status: "PENDING", daysAgo: 0,
    },
    {
      dept: "CBA", title: "Entrepreneurship Bazaar", description: "Student-run food and product stalls for the Entrepreneurship course.", start: weekday(9), end: addDays(weekday(9), 1),
      level: "COLLEGE", location: "Covered Court", participants: "Business Administration students", status: "PENDING", daysAgo: 1,
    },
    {
      dept: "CBA", title: "Accounting Quiz Bee", description: "Elimination round for the regional quiz bee.", start: weekday(4), from: 13 * 60, to: 16 * 60,
      level: "COLLEGE", room: "4101", participants: "Accountancy students, 30 contestants", status: "REJECTED", note: "Conference Room A is reserved for the accreditation visit that day.", daysAgo: 5,
    },
    {
      dept: "CAS", title: "Mathematics Month Opening Program", description: "Opening program with puzzle booths.", start: weekday(5), from: 8 * 60, to: 10 * 60,
      level: "SENIOR_HIGH", room: "4102", participants: "Senior High School students and mathematics teachers", status: "PENDING", daysAgo: 0,
    },
    {
      dept: "CAS", title: "Research Colloquium", description: "Presentation of faculty research outputs.", start: weekday(12), from: 14 * 60, to: 17 * 60,
      level: "COLLEGE", room: "4101", participants: "College faculty and graduating students", status: "APPROVED", daysAgo: 6,
    },
  ];
  for (const s of submissions) {
    const reviewed = s.status !== "PENDING";
    await db.activity.create({
      data: {
        type: "SCHOOL_EVENT", title: s.title, description: s.description, startDate: date(s.start), endDate: date(s.end ?? s.start),
        startMin: s.from ?? null, endMin: s.to ?? null, sectionIds: [], departmentId: dept[s.dept], level: s.level ?? null,
        roomId: s.room ? room[s.room] : null, location: s.location ?? null, participants: s.participants,
        status: s.status, reviewNote: s.note ?? null, reviewedById: reviewed ? adminId : null, reviewedAt: reviewed ? new Date() : null,
        createdById: heads[s.dept], createdAt: new Date(Date.now() - s.daysAgo * DAY_MS),
      },
    });
  }
  // Rooms for activities the Administrator added in the main seed.
  await db.activity.updateMany({ where: { title: "Faculty General Assembly" }, data: { roomId: room["4102"], participants: "All faculty members" } });

  const waiting = submissions.filter((s) => s.status === "PENDING").length;
  await db.notification.create({
    data: { userId: adminId, type: "INFO", title: "Activities awaiting approval", message: `${waiting} school activities from four departments are waiting for your review.`, link: "/calendar?tab=approvals" },
  });
  await db.notification.create({
    data: { userId: heads.CCS, type: "WARNING", title: "Activity returned for changes", message: '"Cybersecurity Awareness Seminar" was returned for changes: Move it after 3:00 PM so second-year classes are not affected.', link: "/calendar?tab=table" },
  });
}
