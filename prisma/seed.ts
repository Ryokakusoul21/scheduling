/**
 * Sample data for GRANBY COLLEGES OF SCIENCE & TECHNOLOGY so every feature can be demonstrated immediately.
 * Dates are computed from the day the seed runs, so the current term, calendar, and examinations are always "now".
 * Run on an empty database: `npx prisma migrate reset`, then `npx prisma db seed`.
 */
import {
  PrismaClient,
  type AcademicLevel,
  type BuildingPurpose,
  type DayOfWeek,
  type GradeLevel,
  type RoomType,
  type SemesterType,
  type YearLevel,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { DEFAULT_COLLEGE_PROGRAMS, DEFAULT_SHS_STRANDS } from "../lib/academics/levels";
import { placeCollegeClasses } from "./sample-timetable";
import { addSampleHistory } from "./sample-history";
import { addArchiveAndApprovalSamples } from "./sample-archive-activities";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = "Passw0rd!";
const WEEKDAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const SCHOOL_DAYS: DayOfWeek[] = [...WEEKDAYS, "SATURDAY"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const date = (s: string) => new Date(`${s}T00:00:00Z`);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Date string `days` after today (local calendar date). */
function fromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Next date on or after `fromDays` from today that falls on the given weekday (0 = Sunday). */
function nextWeekday(weekday: number, fromDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + fromDays);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Small deterministic random generator so enrollment history is identical on every seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log("Database already has data. Run `npx prisma migrate reset` to start over with fresh sample data.");
    return;
  }
  console.log("Seeding GRANBY COLLEGES OF SCIENCE & TECHNOLOGY scheduling database...");

  // -------------------------------------------------------------------
  // Academic calendar relative to today (academic year starts in August)
  // -------------------------------------------------------------------
  const now = new Date();
  const ayYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const inFirstSemester = now.getMonth() >= 6;

  // -------------------------------------------------------------------
  // Departments, college programs, and Senior High School strands
  // -------------------------------------------------------------------
  const departmentDefs = [
    { code: "CCS", name: "College of Computer Studies" },
    { code: "CCJE", name: "College of Criminal Justice Education" },
    { code: "CBA", name: "College of Business and Accountancy" },
    { code: "CHTM", name: "College of Hospitality and Tourism Management" },
    { code: "CTE", name: "College of Teacher Education" },
    { code: "CAS", name: "College of Arts and Sciences" },
    { code: "BED", name: "Basic Education Department" },
  ];
  const dept: Record<string, string> = {};
  for (const d of departmentDefs) dept[d.code] = (await prisma.department.create({ data: d })).id;

  const program: Record<string, string> = {};
  for (const [i, p] of DEFAULT_COLLEGE_PROGRAMS.entries()) {
    program[p.code] = (
      await prisma.program.create({ data: { code: p.code, name: p.name, level: "COLLEGE", sortOrder: i, departmentId: dept[p.department] } })
    ).id;
  }
  for (const [i, s] of DEFAULT_SHS_STRANDS.entries()) {
    program[s.code] = (
      await prisma.program.create({ data: { code: s.code, name: s.name, level: "SENIOR_HIGH", sortOrder: i, departmentId: dept.BED } })
    ).id;
  }

  // -------------------------------------------------------------------
  // Academic years and terms
  // -------------------------------------------------------------------
  await prisma.academicYear.create({
    data: { name: `${ayYear - 1}-${ayYear}`, startDate: date(ymd(ayYear - 1, 8, 1)), endDate: date(ymd(ayYear, 6, 30)) },
  });
  const ay = await prisma.academicYear.create({
    data: { name: `${ayYear}-${ayYear + 1}`, startDate: date(ymd(ayYear, 8, 1)), endDate: date(ymd(ayYear + 1, 6, 30)), isActive: true },
  });
  const term = (level: AcademicLevel, type: SemesterType, name: string, start: string, end: string, isActive = false) =>
    prisma.semester.create({ data: { academicYearId: ay.id, level, type, name, startDate: date(start), endDate: date(end), isActive } });

  const firstSem = await term("COLLEGE", "FIRST", "First Semester", ymd(ayYear, 8, 3), ymd(ayYear, 12, 18), inFirstSemester);
  const secondSem = await term("COLLEGE", "SECOND", "Second Semester", ymd(ayYear + 1, 1, 11), ymd(ayYear + 1, 5, 21), !inFirstSemester);
  await term("COLLEGE", "SUMMER", "Summer", ymd(ayYear + 1, 6, 1), ymd(ayYear + 1, 6, 30));
  const collegeTerm = inFirstSemester ? firstSem : secondSem;

  const quarters = [
    { type: "QUARTER_1" as const, name: "First Quarter", start: ymd(ayYear, 8, 3), end: ymd(ayYear, 10, 16) },
    { type: "QUARTER_2" as const, name: "Second Quarter", start: ymd(ayYear, 10, 19), end: ymd(ayYear + 1, 1, 15) },
    { type: "QUARTER_3" as const, name: "Third Quarter", start: ymd(ayYear + 1, 1, 18), end: ymd(ayYear + 1, 3, 26) },
    { type: "QUARTER_4" as const, name: "Fourth Quarter", start: ymd(ayYear + 1, 3, 29), end: ymd(ayYear + 1, 6, 4) },
  ];
  const today = fromToday(0);
  const currentQuarter = quarters.find((q) => today >= q.start && today <= q.end) ?? quarters[0];
  const quarterTerm: Partial<Record<AcademicLevel, { id: string }>> = {};
  for (const level of ["SENIOR_HIGH", "JUNIOR_HIGH", "ELEMENTARY"] as const) {
    for (const q of quarters) {
      const t = await term(level, q.type, q.name, q.start, q.end, q === currentQuarter);
      if (q === currentQuarter) quarterTerm[level] = t;
    }
  }

  // -------------------------------------------------------------------
  // Buildings -> floors -> rooms (rooms owned by a department or shared)
  // -------------------------------------------------------------------
  // Hours are minutes from midnight; the Main Building uses the campus photo, the rest show illustrations.
  const buildingDefs: { name: string; floors: string[]; code: string; location: string; purpose: BuildingPurpose; open: number; close: number; photo?: string }[] = [
    { name: "Main Building", floors: ["Ground Floor", "Second Floor", "Third Floor"], code: "A", location: "Main campus, facing the quadrangle", purpose: "ACADEMIC", open: 7 * 60, close: 19 * 60, photo: "public/branding/school.jpg" },
    { name: "Information Technology Building", floors: ["Ground Floor", "Second Floor"], code: "B", location: "Main campus, east wing", purpose: "SCIENCE_TECHNOLOGY", open: 7 * 60, close: 20 * 60 },
    { name: "Science Building", floors: ["Ground Floor"], code: "C", location: "Main campus, beside the garden", purpose: "SCIENCE_TECHNOLOGY", open: 7 * 60, close: 18 * 60 },
    { name: "Basic Education Building", floors: ["Ground Floor", "Second Floor"], code: "D", location: "West side, near the covered court", purpose: "ACADEMIC", open: 6 * 60 + 30, close: 17 * 60 },
    { name: "Administration Building", floors: ["Ground Floor"], code: "E", location: "Main entrance", purpose: "ADMINISTRATION", open: 8 * 60, close: 17 * 60 },
  ];
  const floorId: Record<string, string> = {};
  for (const [i, b] of buildingDefs.entries()) {
    const building = await prisma.building.create({
      data: {
        name: b.name, sortOrder: i, code: b.code, location: b.location, purpose: b.purpose, openingMin: b.open, closingMin: b.close,
        ...(b.photo ? { photo: new Uint8Array(readFileSync(b.photo)), photoType: "image/jpeg", photoUpdatedAt: new Date() } : {}),
      },
    });
    for (const [n, name] of b.floors.entries()) {
      floorId[`${b.name}/${name}`] = (await prisma.floor.create({ data: { buildingId: building.id, name, number: n + 1 } })).id;
    }
  }

  type RoomDef = { number: string; name: string; floor: string; capacity: number; type: RoomType; equipment: string[]; dept?: string };
  const roomDefs: RoomDef[] = [
    { number: "101", name: "Room 101", floor: "Main Building/Ground Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "102", name: "Room 102", floor: "Main Building/Ground Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "103", name: "Room 103", floor: "Main Building/Ground Floor", capacity: 50, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector", "Air conditioning"] },
    { number: "201", name: "Room 201", floor: "Main Building/Second Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "202", name: "Room 202", floor: "Main Building/Second Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard"] },
    { number: "203", name: "Room 203", floor: "Main Building/Second Floor", capacity: 42, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Television"] },
    { number: "301", name: "Room 301", floor: "Main Building/Third Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector", "Air conditioning"] },
    { number: "302", name: "Room 302", floor: "Main Building/Third Floor", capacity: 35, type: "LECTURE_ROOM", equipment: ["Whiteboard"] },
    { number: "303", name: "Room 303", floor: "Main Building/Third Floor", capacity: 38, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "1101", name: "Computer Laboratory 1", floor: "Information Technology Building/Ground Floor", capacity: 40, type: "COMPUTER_LABORATORY", equipment: ["40 computers", "Projector", "Air conditioning"], dept: "CCS" },
    { number: "1102", name: "Computer Laboratory 2", floor: "Information Technology Building/Ground Floor", capacity: 40, type: "COMPUTER_LABORATORY", equipment: ["40 computers", "Projector", "Air conditioning"], dept: "CCS" },
    { number: "1201", name: "Computer Laboratory 3", floor: "Information Technology Building/Second Floor", capacity: 35, type: "COMPUTER_LABORATORY", equipment: ["35 computers", "Projector"], dept: "CCS" },
    { number: "1202", name: "Computer Laboratory 4", floor: "Information Technology Building/Second Floor", capacity: 30, type: "COMPUTER_LABORATORY", equipment: ["30 computers"], dept: "CCS" },
    { number: "1203", name: "Lecture Room 1203", floor: "Information Technology Building/Second Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"], dept: "CCS" },
    { number: "2101", name: "Science Laboratory 1", floor: "Science Building/Ground Floor", capacity: 35, type: "SCIENCE_LABORATORY", equipment: ["Laboratory benches", "Fume hood"], dept: "CAS" },
    { number: "2102", name: "Science Laboratory 2", floor: "Science Building/Ground Floor", capacity: 40, type: "SCIENCE_LABORATORY", equipment: ["Laboratory benches"], dept: "CAS" },
    { number: "3101", name: "Classroom 3101", floor: "Basic Education Building/Ground Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Television"], dept: "BED" },
    { number: "3102", name: "Classroom 3102", floor: "Basic Education Building/Ground Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Television"], dept: "BED" },
    { number: "3103", name: "Classroom 3103", floor: "Basic Education Building/Ground Floor", capacity: 35, type: "LECTURE_ROOM", equipment: ["Whiteboard"], dept: "BED" },
    { number: "3201", name: "Classroom 3201", floor: "Basic Education Building/Second Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Television"], dept: "BED" },
    { number: "3202", name: "Classroom 3202", floor: "Basic Education Building/Second Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Television"], dept: "BED" },
    { number: "4101", name: "Conference Room A", floor: "Administration Building/Ground Floor", capacity: 20, type: "CONFERENCE_ROOM", equipment: ["Smart television", "Video conferencing"] },
    { number: "4102", name: "Audio-Visual Room", floor: "Administration Building/Ground Floor", capacity: 120, type: "OTHER", equipment: ["Sound system", "Projector", "Air conditioning"] },
  ];
  const rooms: (RoomDef & { id: string })[] = [];
  for (const [i, r] of roomDefs.entries()) {
    const room = await prisma.room.create({
      data: {
        roomNumber: r.number,
        roomName: r.name,
        floorId: floorId[r.floor],
        sortOrder: i,
        capacity: r.capacity,
        roomType: r.type,
        equipment: r.equipment,
        departmentId: r.dept ? dept[r.dept] : null,
        availability: { create: SCHOOL_DAYS.map((d) => ({ dayOfWeek: d, startMin: 7 * 60, endMin: 19 * 60 })) },
      },
    });
    rooms.push({ ...r, id: room.id });
  }
  const roomByNumber = Object.fromEntries(rooms.map((r) => [r.number, r]));

  // -------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------
  type SectionDef = { name: string; program?: string; year?: YearLevel; grade?: GradeLevel; level: AcademicLevel; count: number; subjects?: string[] };
  const collegeSections: SectionDef[] = [
    { name: "Information Technology 1-A", program: "BSIT", year: "FIRST", level: "COLLEGE", count: 38, subjects: ["GE101", "GE102", "GE104", "IT101", "IT102", "GRANBY100"] },
    { name: "Information Technology 1-B", program: "BSIT", year: "FIRST", level: "COLLEGE", count: 35, subjects: ["GE101", "GE102", "GE103", "IT101", "IT102", "GRANBY100"] },
    { name: "Information Technology 2-A", program: "BSIT", year: "SECOND", level: "COLLEGE", count: 34, subjects: ["IT201", "IT202", "IT203"] },
    { name: "Information Technology 2-B", program: "BSIT", year: "SECOND", level: "COLLEGE", count: 30, subjects: ["IT201", "IT202", "IT203"] },
    { name: "Information Technology 3-A", program: "BSIT", year: "THIRD", level: "COLLEGE", count: 32, subjects: ["IT301", "IT302", "IT303"] },
    { name: "Information Technology 4-A", program: "BSIT", year: "FOURTH", level: "COLLEGE", count: 28, subjects: ["IT401", "IT302"] },
    { name: "Computer Science 1-A", program: "BSCS", year: "FIRST", level: "COLLEGE", count: 33, subjects: ["GE101", "GE104", "IT101", "GRANBY100"] },
    { name: "Computer Science 2-A", program: "BSCS", year: "SECOND", level: "COLLEGE", count: 29, subjects: ["CS201", "CS202", "IT201"] },
    { name: "Criminology 1-A", program: "BSCrim", year: "FIRST", level: "COLLEGE", count: 42, subjects: ["GE101", "GE103", "CRIM101", "GRANBY100"] },
    { name: "Accountancy 1-A", program: "BSA", year: "FIRST", level: "COLLEGE", count: 36, subjects: ["GE101", "GE102", "ACC101", "GRANBY100"] },
    { name: "Business Administration 1-A", program: "BSBA", year: "FIRST", level: "COLLEGE", count: 40, subjects: ["GE103", "GE104", "BA101", "GRANBY100"] },
    { name: "Tourism Management 1-A", program: "BSTM", year: "FIRST", level: "COLLEGE", count: 34, subjects: ["GE102", "TM101", "GRANBY100"] },
    { name: "Industrial Security Management 1-A", program: "BSISM", year: "FIRST", level: "COLLEGE", count: 30, subjects: ["GE103", "ISM101"] },
    { name: "Elementary Education 1-A", program: "BEED", year: "FIRST", level: "COLLEGE", count: 28, subjects: ["GE104", "EED101"] },
    { name: "Secondary Education 1-A", program: "BSED", year: "FIRST", level: "COLLEGE", count: 25, subjects: ["GE102", "ED101", "SCI101"] },
  ];
  const basicSections: SectionDef[] = [
    { name: "Grade 11 - Newton", program: "STEM", grade: "GRADE_11", level: "SENIOR_HIGH", count: 40 },
    { name: "Grade 11 - Pacioli", program: "ABM", grade: "GRADE_11", level: "SENIOR_HIGH", count: 38 },
    { name: "Grade 11 - Balagtas", program: "HUMSS", grade: "GRADE_11", level: "SENIOR_HIGH", count: 40 },
    { name: "Grade 11 - Turing", program: "ICT", grade: "GRADE_11", level: "SENIOR_HIGH", count: 32 },
    { name: "Grade 12 - Curie", program: "STEM", grade: "GRADE_12", level: "SENIOR_HIGH", count: 36 },
    { name: "Grade 12 - Socrates", program: "GAS", grade: "GRADE_12", level: "SENIOR_HIGH", count: 35 },
    { name: "Grade 12 - Edison", program: "TVL", grade: "GRADE_12", level: "SENIOR_HIGH", count: 30 },
    { name: "Grade 7 - Rizal", grade: "GRADE_7", level: "JUNIOR_HIGH", count: 42 },
    { name: "Grade 7 - Bonifacio", grade: "GRADE_7", level: "JUNIOR_HIGH", count: 40 },
    { name: "Grade 8 - Mabini", grade: "GRADE_8", level: "JUNIOR_HIGH", count: 41 },
    { name: "Grade 9 - Luna", grade: "GRADE_9", level: "JUNIOR_HIGH", count: 39 },
    { name: "Grade 10 - Aguinaldo", grade: "GRADE_10", level: "JUNIOR_HIGH", count: 38 },
    { name: "Kinder - Sampaguita", grade: "KINDER", level: "ELEMENTARY", count: 25 },
    { name: "Grade 1 - Rosal", grade: "GRADE_1", level: "ELEMENTARY", count: 32 },
    { name: "Grade 2 - Ilang-Ilang", grade: "GRADE_2", level: "ELEMENTARY", count: 33 },
    { name: "Grade 3 - Gumamela", grade: "GRADE_3", level: "ELEMENTARY", count: 34 },
    { name: "Grade 4 - Dahlia", grade: "GRADE_4", level: "ELEMENTARY", count: 35 },
    { name: "Grade 5 - Orchid", grade: "GRADE_5", level: "ELEMENTARY", count: 34 },
    { name: "Grade 6 - Camia", grade: "GRADE_6", level: "ELEMENTARY", count: 36 },
  ];
  const section: Record<string, { id: string; count: number }> = {};
  for (const [i, s] of [...collegeSections, ...basicSections].entries()) {
    const row = await prisma.section.create({
      data: {
        name: s.name,
        level: s.level,
        yearLevel: s.year,
        gradeLevel: s.grade,
        programId: s.program ? program[s.program] : null,
        semesterId: s.level === "COLLEGE" ? collegeTerm.id : null,
        studentCount: s.count,
        sortOrder: i,
      },
    });
    section[s.name] = { id: row.id, count: s.count };
  }

  // -------------------------------------------------------------------
  // Subjects
  // -------------------------------------------------------------------
  type SubjectDef = { code: string; name: string; units: number; lecture: number; lab: number; room: RoomType; level?: AcademicLevel; program?: string; year?: YearLevel; grade?: GradeLevel };
  const subjectDefs: SubjectDef[] = [
    { code: "GE101", name: "Mathematics in the Modern World", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", year: "FIRST" },
    { code: "GE102", name: "Purposive Communication", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", year: "FIRST" },
    { code: "GE103", name: "Readings in Philippine History", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", year: "FIRST" },
    { code: "GE104", name: "Understanding the Self", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", year: "FIRST" },
    { code: "GRANBY100", name: "Granby Values", units: 1, lecture: 1, lab: 0, room: "LECTURE_ROOM" },
    { code: "IT101", name: "Introduction to Computing", units: 3, lecture: 2, lab: 1, room: "COMPUTER_LABORATORY", program: "BSIT", year: "FIRST" },
    { code: "IT102", name: "Computer Programming 1", units: 3, lecture: 2, lab: 1, room: "COMPUTER_LABORATORY", program: "BSIT", year: "FIRST" },
    { code: "IT103", name: "Computer Programming 2", units: 3, lecture: 2, lab: 1, room: "COMPUTER_LABORATORY", program: "BSIT", year: "FIRST" },
    { code: "IT201", name: "Data Structures and Algorithms", units: 3, lecture: 2, lab: 1, room: "COMPUTER_LABORATORY", program: "BSIT", year: "SECOND" },
    { code: "IT202", name: "Database Management Systems", units: 3, lecture: 2, lab: 1, room: "COMPUTER_LABORATORY", program: "BSIT", year: "SECOND" },
    { code: "IT203", name: "Networking 1", units: 3, lecture: 2, lab: 1, room: "COMPUTER_LABORATORY", program: "BSIT", year: "SECOND" },
    { code: "IT301", name: "Web Development", units: 3, lecture: 2, lab: 1, room: "COMPUTER_LABORATORY", program: "BSIT", year: "THIRD" },
    { code: "IT302", name: "Systems Analysis and Design", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSIT", year: "THIRD" },
    { code: "IT303", name: "Information Assurance and Security", units: 3, lecture: 2, lab: 1, room: "COMPUTER_LABORATORY", program: "BSIT", year: "THIRD" },
    { code: "IT401", name: "Capstone Project 1", units: 3, lecture: 1, lab: 2, room: "COMPUTER_LABORATORY", program: "BSIT", year: "FOURTH" },
    { code: "CS201", name: "Discrete Mathematics", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSCS", year: "SECOND" },
    { code: "CS202", name: "Automata Theory", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSCS", year: "SECOND" },
    { code: "SCI101", name: "General Chemistry", units: 3, lecture: 2, lab: 1, room: "SCIENCE_LABORATORY", year: "FIRST" },
    { code: "CRIM101", name: "Introduction to Criminology", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSCrim", year: "FIRST" },
    { code: "ACC101", name: "Financial Accounting and Reporting", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSA", year: "FIRST" },
    { code: "BA101", name: "Principles of Management", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSBA", year: "FIRST" },
    { code: "TM101", name: "Macro Perspective of Tourism and Hospitality", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSTM", year: "FIRST" },
    { code: "ISM101", name: "Introduction to Industrial Security", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSISM", year: "FIRST" },
    { code: "EED101", name: "Child and Adolescent Development", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BEED", year: "FIRST" },
    { code: "ED101", name: "The Teaching Profession", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSED", year: "FIRST" },
    { code: "SHS-ORALCOM", name: "Oral Communication in Context", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11" },
    { code: "SHS-GENMATH", name: "General Mathematics", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11" },
    { code: "SHS-EARTHSCI", name: "Earth and Life Science", units: 1, lecture: 3, lab: 1, room: "SCIENCE_LABORATORY", level: "SENIOR_HIGH", grade: "GRADE_11" },
    { code: "SHS-PRECAL", name: "Pre-Calculus", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11", program: "STEM" },
    { code: "SHS-BUSMATH", name: "Business Mathematics", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11", program: "ABM" },
    { code: "SHS-CREATIVE", name: "Creative Writing", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11", program: "HUMSS" },
    { code: "SHS-CSS", name: "Computer Systems Servicing", units: 1, lecture: 1, lab: 3, room: "COMPUTER_LABORATORY", level: "SENIOR_HIGH", grade: "GRADE_11", program: "ICT" },
    { code: "SHS-STATPROB", name: "Statistics and Probability", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_12" },
    { code: "SHS-RESEARCH2", name: "Practical Research 2", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_12" },
    { code: "SHS-GENBIO", name: "General Biology", units: 1, lecture: 3, lab: 1, room: "SCIENCE_LABORATORY", level: "SENIOR_HIGH", grade: "GRADE_12", program: "STEM" },
  ];
  const juniorHighCore = ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "Music, Arts, Physical Education and Health", "Technology and Livelihood Education", "Edukasyon sa Pagpapakatao"];
  const codeOf = (name: string) => name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase();
  for (const g of [7, 8, 9, 10]) {
    for (const name of juniorHighCore) {
      const science = name === "Science";
      subjectDefs.push({ code: `${codeOf(name)}${g}`, name: `${name} ${g}`, units: 1, lecture: science ? 3 : 4, lab: science ? 1 : 0, room: science ? "SCIENCE_LABORATORY" : "LECTURE_ROOM", level: "JUNIOR_HIGH", grade: `GRADE_${g}` as GradeLevel });
    }
  }
  subjectDefs.push(
    { code: "K-LITERACY", name: "Kindergarten Literacy", units: 1, lecture: 3, lab: 0, room: "LECTURE_ROOM", level: "ELEMENTARY", grade: "KINDER" },
    { code: "K-NUMERACY", name: "Kindergarten Numeracy", units: 1, lecture: 3, lab: 0, room: "LECTURE_ROOM", level: "ELEMENTARY", grade: "KINDER" },
  );
  const elementaryCore = ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "Music, Arts, Physical Education and Health", "Edukasyon sa Pagpapakatao"];
  for (const g of [1, 2, 3, 4, 5, 6]) {
    for (const name of elementaryCore) {
      if (name === "Science" && g < 3) continue;
      subjectDefs.push({ code: `ELEM${g}-${codeOf(name).slice(0, 5)}`, name: `${name} ${g}`, units: 1, lecture: 3, lab: 0, room: "LECTURE_ROOM", level: "ELEMENTARY", grade: `GRADE_${g}` as GradeLevel });
    }
  }
  const subject: Record<string, SubjectDef & { id: string }> = {};
  for (const [i, s] of subjectDefs.entries()) {
    const row = await prisma.subject.create({
      data: {
        code: s.code, name: s.name, units: s.units, lectureHours: s.lecture, labHours: s.lab, requiredRoomType: s.room,
        level: s.level ?? "COLLEGE", programId: s.program ? program[s.program] : null, yearLevel: s.year, gradeLevel: s.grade, sortOrder: i,
      },
    });
    subject[s.code] = { ...s, id: row.id };
  }

  // -------------------------------------------------------------------
  // Faculty (honorifics omitted; the position field carries the rank)
  // -------------------------------------------------------------------
  const facultyDefs: { id: string; name: string; email: string; dept: string; position: string; specialization: string; maxHours: number; levels: AcademicLevel[] }[] = [
    { id: "F-001", name: "Ana Santos", email: "santos@granby.edu.ph", dept: "CCS", position: "Associate Professor", specialization: "Programming", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-002", name: "Ramon Reyes", email: "reyes@granby.edu.ph", dept: "CCS", position: "Assistant Professor", specialization: "Web Development", maxHours: 24, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { id: "F-003", name: "Liza Cruz", email: "cruz@granby.edu.ph", dept: "CCS", position: "Professor", specialization: "Database Systems", maxHours: 21, levels: ["COLLEGE"] },
    { id: "F-004", name: "Miguel Torres", email: "torres@granby.edu.ph", dept: "CCS", position: "Instructor", specialization: "Networking", maxHours: 24, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { id: "F-005", name: "Carla Dizon", email: "dizon@granby.edu.ph", dept: "CCS", position: "Instructor", specialization: "Data Structures", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-006", name: "Noel Villanueva", email: "villanueva@granby.edu.ph", dept: "CCS", position: "Assistant Professor", specialization: "Information Security", maxHours: 21, levels: ["COLLEGE"] },
    { id: "F-007", name: "Grace Mercado", email: "mercado@granby.edu.ph", dept: "CCS", position: "Instructor", specialization: "Systems Analysis", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-008", name: "Daniel Ramos", email: "ramos@granby.edu.ph", dept: "CAS", position: "Professor", specialization: "Mathematics", maxHours: 24, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { id: "F-009", name: "Ella Fernandez", email: "fernandez@granby.edu.ph", dept: "CAS", position: "Assistant Professor", specialization: "Communication", maxHours: 21, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { id: "F-010", name: "Victor Aquino", email: "aquino@granby.edu.ph", dept: "CAS", position: "Instructor", specialization: "History", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-011", name: "Sonia Bautista", email: "bautista@granby.edu.ph", dept: "CAS", position: "Instructor", specialization: "Chemistry", maxHours: 21, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { id: "F-012", name: "Ricardo Lim", email: "lim@granby.edu.ph", dept: "CBA", position: "Associate Professor", specialization: "Management", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-013", name: "Teresa Navarro", email: "navarro@granby.edu.ph", dept: "CTE", position: "Assistant Professor", specialization: "Education", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-014", name: "Paolo Garcia", email: "garcia@granby.edu.ph", dept: "CCS", position: "Instructor", specialization: "Discrete Mathematics and Programming", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-015", name: "Mika Alonzo", email: "alonzo@granby.edu.ph", dept: "CCS", position: "Instructor", specialization: "Automata Theory and Programming", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-016", name: "Arnel Castillo", email: "castillo@granby.edu.ph", dept: "CCJE", position: "Instructor", specialization: "Criminology", maxHours: 24, levels: ["COLLEGE"] },
    { id: "F-017", name: "Joy Salazar", email: "salazar@granby.edu.ph", dept: "CBA", position: "Instructor", specialization: "Accounting", maxHours: 24, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { id: "F-018", name: "Karen Ocampo", email: "ocampo@granby.edu.ph", dept: "CHTM", position: "Instructor", specialization: "Tourism", maxHours: 24, levels: ["COLLEGE"] },
    { id: "T-001", name: "Liza Domingo", email: "domingo@granby.edu.ph", dept: "BED", position: "Teacher II", specialization: "English", maxHours: 30, levels: ["JUNIOR_HIGH"] },
    { id: "T-002", name: "Jerome Pascual", email: "pascual@granby.edu.ph", dept: "BED", position: "Teacher I", specialization: "Mathematics", maxHours: 30, levels: ["JUNIOR_HIGH", "SENIOR_HIGH"] },
    { id: "T-003", name: "Rhea Manalo", email: "manalo@granby.edu.ph", dept: "BED", position: "Teacher III", specialization: "Science", maxHours: 30, levels: ["JUNIOR_HIGH"] },
    { id: "T-004", name: "Joan Velasco", email: "velasco@granby.edu.ph", dept: "BED", position: "Teacher I", specialization: "Filipino", maxHours: 30, levels: ["ELEMENTARY", "JUNIOR_HIGH"] },
    { id: "T-005", name: "Marites Soriano", email: "soriano@granby.edu.ph", dept: "BED", position: "Teacher II", specialization: "Early Childhood Education", maxHours: 30, levels: ["ELEMENTARY"] },
    { id: "T-006", name: "Benjie Tolentino", email: "tolentino@granby.edu.ph", dept: "BED", position: "Teacher I", specialization: "Music, Arts, Physical Education and Health", maxHours: 30, levels: ["ELEMENTARY", "JUNIOR_HIGH"] },
  ];
  // Ana Santos teaches only Friday mornings, which the scheduler and the automatic adjustments respect.
  const fridayMorningOnly = new Set(["F-001"]);
  const faculty: Record<string, { id: string; windows: { day: DayOfWeek; start: number; end: number }[] }> = {};
  for (const f of facultyDefs) {
    const windows = WEEKDAYS.map((d) => ({ day: d, start: 7 * 60, end: d === "FRIDAY" && fridayMorningOnly.has(f.id) ? 12 * 60 : 18 * 60 }));
    const row = await prisma.faculty.create({
      data: {
        employeeId: f.id, fullName: f.name, email: f.email, departmentId: dept[f.dept], position: f.position,
        specialization: f.specialization, maxHours: f.maxHours, teachingLevels: f.levels,
        availability: { create: windows.map((w) => ({ dayOfWeek: w.day, startMin: w.start, endMin: w.end })) },
      },
    });
    faculty[f.id] = { id: row.id, windows };
  }

  // Basic education sample timetables (fixed meetings).
  type FixedMeeting = { subject: string; faculty: string; room: string; day: DayOfWeek; start: string; end: string; lab?: boolean };
  const fixed: { section: string; termId: string; meetings: FixedMeeting[] }[] = [
    {
      section: "Grade 11 - Newton",
      termId: quarterTerm.SENIOR_HIGH!.id,
      meetings: [
        { subject: "SHS-ORALCOM", faculty: "F-009", room: "3201", day: "MONDAY", start: "07:30", end: "08:30" },
        { subject: "SHS-GENMATH", faculty: "T-002", room: "3201", day: "MONDAY", start: "13:00", end: "14:00" },
        { subject: "SHS-PRECAL", faculty: "T-002", room: "3201", day: "TUESDAY", start: "07:30", end: "08:30" },
        { subject: "SHS-EARTHSCI", faculty: "T-003", room: "2102", day: "THURSDAY", start: "13:00", end: "15:00", lab: true },
      ],
    },
    {
      section: "Grade 7 - Rizal",
      termId: quarterTerm.JUNIOR_HIGH!.id,
      meetings: [
        { subject: "ENGLIS7", faculty: "T-001", room: "3101", day: "MONDAY", start: "07:30", end: "08:30" },
        { subject: "MATHEM7", faculty: "T-002", room: "3101", day: "MONDAY", start: "08:30", end: "09:30" },
        { subject: "SCIENC7", faculty: "T-003", room: "3101", day: "TUESDAY", start: "07:30", end: "08:30" },
        { subject: "FILIPI7", faculty: "T-004", room: "3101", day: "TUESDAY", start: "08:30", end: "09:30" },
        { subject: "MUSICA7", faculty: "T-006", room: "3101", day: "WEDNESDAY", start: "07:30", end: "08:30" },
      ],
    },
    {
      section: "Grade 1 - Rosal",
      termId: quarterTerm.ELEMENTARY!.id,
      meetings: [
        { subject: "ELEM1-ENGLI", faculty: "T-005", room: "3103", day: "MONDAY", start: "08:00", end: "09:00" },
        { subject: "ELEM1-FILIP", faculty: "T-004", room: "3103", day: "MONDAY", start: "09:30", end: "10:30" },
        { subject: "ELEM1-MATHE", faculty: "T-005", room: "3103", day: "TUESDAY", start: "08:00", end: "09:00" },
      ],
    },
  ];
  // Fixed meetings are saved first so the college generator works around them.
  for (const t of fixed) {
    await prisma.schedule.createMany({
      data: t.meetings.map((m) => ({
        semesterId: t.termId, sectionId: section[t.section].id, subjectId: subject[m.subject].id, facultyId: faculty[m.faculty].id,
        roomId: roomByNumber[m.room].id, component: m.lab ? ("LABORATORY" as const) : ("LECTURE" as const), dayOfWeek: m.day,
        startMin: toMin(m.start), endMin: toMin(m.end), status: "PUBLISHED" as const,
      })),
    });
  }

  // College timetables: conflict-free generated placement (shared with the sample history script).
  const placed = await placeCollegeClasses(
    prisma,
    collegeTerm.id,
    collegeSections.map((s) => ({ id: section[s.name].id, name: s.name, count: s.count, subjects: s.subjects ?? [] }))
  );

  // -------------------------------------------------------------------
  // Demo accounts: one per role; Head of Department and Faculty are linked to faculty records
  // -------------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  const userDefs = [
    { email: "administrator@granby.edu.ph", name: "Cecilia Robles", role: "ADMINISTRATOR" as const },
    { email: "head.computing@granby.edu.ph", name: "Liza Cruz", role: "HEAD_OF_DEPARTMENT" as const, facultyId: faculty["F-003"].id },
    { email: "head.basiceducation@granby.edu.ph", name: "Rhea Manalo", role: "HEAD_OF_DEPARTMENT" as const, facultyId: faculty["T-003"].id },
    { email: "faculty@granby.edu.ph", name: "Ana Santos", role: "FACULTY" as const, facultyId: faculty["F-001"].id },
    { email: "dizon@granby.edu.ph", name: "Carla Dizon", role: "FACULTY" as const, facultyId: faculty["F-005"].id },
    // Underloaded on purpose (3 hours) so the Faculty dashboard shows a load below the minimum.
    { email: "alonzo@granby.edu.ph", name: "Mika Alonzo", role: "FACULTY" as const, facultyId: faculty["F-015"].id },
  ];
  const user: Record<string, string> = {};
  for (const u of userDefs) {
    user[u.email] = (
      await prisma.user.create({ data: { ...u, status: "ACTIVE", emailVerified: new Date(), termsAcceptedAt: new Date(), passwordHash } })
    ).id;
  }

  // Demo students (view-only portal at /student); fictional names and numbers.
  const studentDefs = [
    { email: "student.stem@granby.edu.ph", name: "Paolo Reyes", studentNumber: "136512090001", section: "Grade 11 - Newton" },
    { email: "student.college@granby.edu.ph", name: "Bea Villanueva", studentNumber: "2026-00142", section: "Information Technology 1-A" },
  ];
  for (const s of studentDefs) {
    await prisma.user.create({
      data: {
        email: s.email, name: s.name, role: "STUDENT", status: "ACTIVE", emailVerified: new Date(), termsAcceptedAt: new Date(), passwordHash,
        student: { create: { studentNumber: s.studentNumber, sectionId: section[s.section].id } },
      },
    });
  }

  // -------------------------------------------------------------------
  // Examinations (Saturday, when no regular college classes meet)
  // -------------------------------------------------------------------
  const examDay = nextWeekday(6, 3);
  const examDefs = [
    { section: "Information Technology 1-A", subject: "IT101", room: "101", proctor: "F-005", start: "08:00", end: "10:00" },
    { section: "Information Technology 1-B", subject: "IT101", room: "102", proctor: "F-014", start: "08:00", end: "10:00" },
    { section: "Information Technology 2-A", subject: "IT202", room: "201", proctor: "F-003", start: "10:30", end: "12:30" },
    { section: "Information Technology 2-B", subject: "IT202", room: "202", proctor: "F-015", start: "10:30", end: "12:30" },
    { section: "Computer Science 2-A", subject: "CS201", room: "203", proctor: "F-014", start: "13:00", end: "15:00" },
  ];
  for (const e of examDefs) {
    await prisma.examination.create({
      data: {
        semesterId: collegeTerm.id, sectionId: section[e.section].id, subjectId: subject[e.subject].id, roomId: roomByNumber[e.room].id,
        proctorId: faculty[e.proctor].id, type: "MIDTERM", date: date(examDay), startMin: toMin(e.start), endMin: toMin(e.end),
      },
    });
  }

  // -------------------------------------------------------------------
  // Calendar activities, a room booking, and a pending unavailability report
  // -------------------------------------------------------------------
  const holidays = [
    { title: "National Heroes Day", day: (() => { const d = new Date(Date.UTC(ayYear, 7, 31)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })() },
    { title: "All Saints' Day", day: ymd(ayYear, 11, 1) },
    { title: "Bonifacio Day", day: ymd(ayYear, 11, 30) },
    { title: "Feast of the Immaculate Conception", day: ymd(ayYear, 12, 8) },
    { title: "Rizal Day", day: ymd(ayYear, 12, 30) },
  ];
  for (const h of holidays) {
    await prisma.activity.create({ data: { type: "HOLIDAY", title: h.title, startDate: date(h.day), endDate: date(h.day), sectionIds: [] } });
  }
  await prisma.activity.createMany({
    data: [
      { type: "SCHOOL_EVENT", title: "Faculty General Assembly", description: "Audio-Visual Room. All faculty members are expected to attend.", startDate: date(fromToday(1)), endDate: date(fromToday(1)), startMin: 16 * 60, endMin: 17 * 60 + 30, sectionIds: [] },
      { type: "SCHOOL_EVENT", title: "Foundation Week", description: "Exhibits, sports festival, and the Granby Values recognition rites.", startDate: date(fromToday(14)), endDate: date(fromToday(18)), sectionIds: [] },
      { type: "SCHOOL_EVENT", title: "Midterm Examination Day", description: "College midterm examinations.", startDate: date(examDay), endDate: date(examDay), sectionIds: [] },
    ],
  });
  await prisma.roomBooking.create({
    data: {
      roomId: roomByNumber["4101"].id, bookedById: user["head.computing@granby.edu.ph"], purpose: "College of Computer Studies curriculum meeting",
      date: date(nextWeekday(3, 2)), startMin: 13 * 60, endMin: 15 * 60, attendees: 12,
    },
  });
  const dizonDay = (await prisma.schedule.findFirst({ where: { facultyId: faculty["F-005"].id, semesterId: collegeTerm.id } }))?.dayOfWeek ?? "TUESDAY";
  const dizonDate = nextWeekday(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].indexOf(dizonDay), 4);
  await prisma.unavailability.create({
    data: {
      kind: "FACULTY", facultyId: faculty["F-005"].id, startDate: date(dizonDate), endDate: date(dizonDate),
      reason: "Attending the regional data science seminar", reportedById: user["dizon@granby.edu.ph"],
    },
  });
  await prisma.notification.create({
    data: {
      userId: user["head.computing@granby.edu.ph"], type: "WARNING", title: "Faculty unavailability reported",
      message: "Carla Dizon reported being unavailable. Review it in Schedule Adjustments to reassign the affected classes.", link: "/adjustments",
    },
  });

  // -------------------------------------------------------------------
  // Enrollment history (seven academic years) for forecasting
  // -------------------------------------------------------------------
  const random = mulberry32(2026);
  const trends: { level: AcademicLevel; program?: string; base: number; growth: number }[] = [
    { level: "COLLEGE", program: "BSIT", base: 160, growth: 0.09 },
    { level: "COLLEGE", program: "BSCS", base: 55, growth: 0.07 },
    { level: "COLLEGE", program: "BSCrim", base: 120, growth: 0.03 },
    { level: "COLLEGE", program: "BSISM", base: 40, growth: -0.02 },
    { level: "COLLEGE", program: "BSA", base: 70, growth: 0.04 },
    { level: "COLLEGE", program: "BSBA", base: 110, growth: 0.02 },
    { level: "COLLEGE", program: "BSTM", base: 90, growth: -0.04 },
    { level: "COLLEGE", program: "BEED", base: 45, growth: 0.01 },
    { level: "COLLEGE", program: "BSED", base: 50, growth: 0.0 },
    ...DEFAULT_SHS_STRANDS.map((s, i) => ({ level: "SENIOR_HIGH" as const, program: s.code, base: 45 + i * 8, growth: 0.03 })),
    { level: "JUNIOR_HIGH", base: 210, growth: 0.02 },
    { level: "ELEMENTARY", base: 230, growth: 0.015 },
  ];
  const records = [];
  for (let y = ayYear - 6; y <= ayYear; y++) {
    const yearIndex = y - (ayYear - 6);
    for (const t of trends) {
      const base = t.base * Math.pow(1 + t.growth, yearIndex) * (y === ayYear - 5 ? 0.88 : 1); // a pandemic-era dip
      const first = Math.round(base * (0.95 + random() * 0.1));
      const academicYear = `${y}-${y + 1}`;
      records.push({ level: t.level, programId: t.program ? program[t.program] : null, academicYear, termType: "FIRST" as const, enrolled: first });
      // College runs two semesters; the second has some attrition. The current second semester has not happened yet.
      if (t.level === "COLLEGE" && !(y === ayYear && inFirstSemester)) {
        records.push({ level: t.level, programId: program[t.program!], academicYear, termType: "SECOND" as const, enrolled: Math.round(first * (0.9 + random() * 0.05)) });
      }
    }
  }
  await prisma.enrollmentRecord.createMany({ data: records });

  // -------------------------------------------------------------------
  // System settings
  // -------------------------------------------------------------------
  await prisma.systemSetting.createMany({
    data: [
      { key: "institution", value: { name: "GRANBY COLLEGES OF SCIENCE & TECHNOLOGY", location: "Naic, Cavite, Philippines" } },
      { key: "workload", value: { measure: "HOURS", minimum: 12, maximum: 24 } },
    ],
  });

  // Scheduling constraints: hard rules block saving, soft rules warn and can be overridden.
  await prisma.schedulingConstraint.createMany({
    data: [
      { kind: "NO_DOUBLE_BOOKING", name: "No double-booking of faculty, rooms, or sections", params: {} },
      { kind: "ROOM_CAPACITY", name: "Room capacity must fit the section", params: {} },
      { kind: "ROOM_DESIGNATION", name: "Room must match the program or strand", params: {} },
      { kind: "MAX_TEACHING_LOAD", name: "Maximum teaching load", params: { maxDailyHours: 8, maxWeeklyHours: 40 } },
      { kind: "LUNCH_BREAK", name: "Lunch break", params: { startMin: toMin("12:00"), endMin: toMin("13:00") } },
      { kind: "MAX_CONSECUTIVE", name: "At most 4 back-to-back classes per section", params: { maxConsecutive: 4, appliesTo: "SECTION" } },
      { kind: "SUBJECT_TIME_OF_DAY", name: "General Mathematics in the morning", params: { subjectId: subject["SHS-GENMATH"].id, period: "MORNING" } },
      { kind: "PREFERRED_TIME", name: "Ana Santos prefers Saturdays off", params: { facultyId: faculty["F-001"].id, startMin: toMin("07:00"), endMin: toMin("17:00"), daysOff: ["SATURDAY"] } },
      { kind: "MINIMUM_GAP", name: "Fifteen minutes between faculty classes", params: { minutes: 15, appliesTo: "FACULTY" }, enabled: false },
    ],
  });

  // Previous semester, past bookings, and automatically resolved conflicts for trend comparisons.
  await addSampleHistory(prisma);

  // Archived records and department activity submissions for the Archive and Activity Approvals pages.
  await addArchiveAndApprovalSamples(prisma, passwordHash);

  console.log(`Seed complete: ${placed} college class meetings placed in ${collegeTerm.name} ${ay.name}.`);
  console.log(`Demo login password for every demo account: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
