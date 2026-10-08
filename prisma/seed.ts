import {
  PrismaClient,
  type AcademicLevel,
  type DayOfWeek,
  type GradeLevel,
  type Role,
  type RoomType,
  type SemesterType,
  type YearLevel,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { DEFAULT_COLLEGE_PROGRAMS, DEFAULT_SHS_STRANDS } from "../lib/academics/levels";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = "Passw0rd!";
const WEEKDAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const SCHOOL_DAYS: DayOfWeek[] = [...WEEKDAYS, "SATURDAY"];

async function hash(pw: string) {
  return bcrypt.hash(pw, 12);
}

/** Terms have no natural unique key (programId is nullable), so look them up first. */
async function upsertTerm(data: {
  academicYearId: string;
  level: AcademicLevel;
  programId?: string | null;
  type: SemesterType;
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}) {
  const existing = await prisma.semester.findFirst({
    where: { academicYearId: data.academicYearId, level: data.level, programId: data.programId ?? null, type: data.type },
  });
  if (existing) return existing;
  return prisma.semester.create({
    data: { ...data, programId: data.programId ?? null, startDate: new Date(data.startDate), endDate: new Date(data.endDate) },
  });
}

async function upsertSection(data: {
  name: string;
  level: AcademicLevel;
  yearLevel?: YearLevel;
  gradeLevel?: GradeLevel;
  programId?: string | null;
  semesterId?: string | null;
  studentCount: number;
  sortOrder: number;
}) {
  const existing = await prisma.section.findFirst({ where: { name: data.name, semesterId: data.semesterId ?? null } });
  if (existing) {
    return prisma.section.update({
      where: { id: existing.id },
      data: { level: data.level, gradeLevel: data.gradeLevel ?? null, sortOrder: data.sortOrder },
    });
  }
  return prisma.section.create({ data });
}

async function main() {
  console.log("Seeding Granby Colleges of Science & Technology scheduling database...");

  // -------------------------------------------------------------------
  // Departments, college programs, and SHS strands
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
  const deptByCode: Record<string, { id: string }> = {};
  for (const d of departmentDefs) {
    deptByCode[d.code] = await prisma.department.upsert({ where: { code: d.code }, update: {}, create: d });
  }

  const programByCode: Record<string, { id: string }> = {};
  for (const [i, p] of DEFAULT_COLLEGE_PROGRAMS.entries()) {
    programByCode[p.code] = await prisma.program.upsert({
      where: { code: p.code },
      update: { level: "COLLEGE", sortOrder: i },
      create: { code: p.code, name: p.name, level: "COLLEGE", sortOrder: i, departmentId: deptByCode[p.department].id },
    });
  }
  for (const [i, s] of DEFAULT_SHS_STRANDS.entries()) {
    programByCode[s.code] = await prisma.program.upsert({
      where: { code: s.code },
      update: { level: "SENIOR_HIGH", sortOrder: i },
      create: { code: s.code, name: s.name, level: "SENIOR_HIGH", sortOrder: i, departmentId: deptByCode.BED.id },
    });
  }

  // -------------------------------------------------------------------
  // Academic years and terms
  // -------------------------------------------------------------------
  const ay2526 = await prisma.academicYear.upsert({
    where: { name: "2025-2026" },
    update: { isActive: true },
    create: { name: "2025-2026", startDate: new Date("2025-08-01"), endDate: new Date("2026-06-30"), isActive: true },
  });
  await prisma.academicYear.upsert({
    where: { name: "2024-2025" },
    update: {},
    create: { name: "2024-2025", startDate: new Date("2024-08-01"), endDate: new Date("2025-06-30"), isActive: false },
  });

  // College semesters shared by every course (programId = null). Per-course semesters can be added in the UI.
  const firstSem = await upsertTerm({
    academicYearId: ay2526.id, level: "COLLEGE", type: "FIRST", name: "First Semester",
    startDate: "2025-08-01", endDate: "2025-12-15", isActive: true,
  });
  await upsertTerm({ academicYearId: ay2526.id, level: "COLLEGE", type: "SECOND", name: "Second Semester", startDate: "2026-01-05", endDate: "2026-05-15" });
  await upsertTerm({ academicYearId: ay2526.id, level: "COLLEGE", type: "SUMMER", name: "Summer", startDate: "2026-06-01", endDate: "2026-06-30" });

  const quarterDates = [
    { type: "QUARTER_1" as const, name: "First Quarter", startDate: "2025-08-04", endDate: "2025-10-17" },
    { type: "QUARTER_2" as const, name: "Second Quarter", startDate: "2025-10-20", endDate: "2026-01-16" },
    { type: "QUARTER_3" as const, name: "Third Quarter", startDate: "2026-01-19", endDate: "2026-03-27" },
    { type: "QUARTER_4" as const, name: "Fourth Quarter", startDate: "2026-03-30", endDate: "2026-06-05" },
  ];
  const firstQuarterByLevel: Partial<Record<AcademicLevel, { id: string }>> = {};
  for (const level of ["SENIOR_HIGH", "JUNIOR_HIGH", "ELEMENTARY"] as const) {
    for (const q of quarterDates) {
      const term = await upsertTerm({ academicYearId: ay2526.id, level, ...q, isActive: q.type === "QUARTER_1" });
      if (q.type === "QUARTER_1") firstQuarterByLevel[level] = term;
    }
  }

  // -------------------------------------------------------------------
  // Buildings -> floors -> rooms
  // -------------------------------------------------------------------
  const buildingDefs: { name: string; code: string; floors: string[] }[] = [
    { name: "Main Building", code: "MB", floors: ["Ground Floor", "2nd Floor", "3rd Floor"] },
    { name: "IT Building", code: "ITB", floors: ["Ground Floor", "2nd Floor"] },
    { name: "Science Building", code: "SB", floors: ["Ground Floor"] },
    { name: "Basic Education Building", code: "BEB", floors: ["Ground Floor", "2nd Floor"] },
    { name: "Admin Building", code: "AB", floors: ["Ground Floor"] },
  ];
  const floorId: Record<string, string> = {};
  for (const [i, b] of buildingDefs.entries()) {
    const building = await prisma.building.upsert({
      where: { name: b.name },
      update: { code: b.code, sortOrder: i },
      create: { name: b.name, code: b.code, sortOrder: i },
    });
    for (const [n, floorName] of b.floors.entries()) {
      const floor = await prisma.floor.upsert({
        where: { buildingId_name: { buildingId: building.id, name: floorName } },
        update: { number: n + 1 },
        create: { buildingId: building.id, name: floorName, number: n + 1 },
      });
      floorId[`${b.name}/${floorName}`] = floor.id;
    }
  }

  const roomDefs: { number: string; name: string; floor: string; capacity: number; type: RoomType; equipment: string[] }[] = [
    { number: "101", name: "Room 101", floor: "Main Building/Ground Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "102", name: "Room 102", floor: "Main Building/Ground Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "201", name: "Room 201", floor: "Main Building/2nd Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "202", name: "Room 202", floor: "Main Building/2nd Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard"] },
    { number: "301", name: "Room 301", floor: "Main Building/3rd Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector", "Aircon"] },
    { number: "302", name: "Room 302", floor: "Main Building/3rd Floor", capacity: 35, type: "LECTURE_ROOM", equipment: ["Whiteboard"] },
    { number: "303", name: "Room 303", floor: "Main Building/3rd Floor", capacity: 38, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "LAB1", name: "Computer Laboratory 1", floor: "IT Building/Ground Floor", capacity: 40, type: "COMPUTER_LABORATORY", equipment: ["40 PCs", "Projector", "Aircon"] },
    { number: "LAB2", name: "Computer Laboratory 2", floor: "IT Building/Ground Floor", capacity: 40, type: "COMPUTER_LABORATORY", equipment: ["40 PCs", "Projector", "Aircon"] },
    { number: "LAB3", name: "Computer Laboratory 3", floor: "IT Building/2nd Floor", capacity: 35, type: "COMPUTER_LABORATORY", equipment: ["35 PCs", "Projector"] },
    { number: "LAB4", name: "Computer Laboratory 4", floor: "IT Building/2nd Floor", capacity: 30, type: "COMPUTER_LABORATORY", equipment: ["30 PCs"] },
    { number: "LAB5", name: "Computer Laboratory 5", floor: "IT Building/2nd Floor", capacity: 40, type: "COMPUTER_LABORATORY", equipment: ["40 PCs", "Projector"] },
    { number: "SCI1", name: "Science Laboratory 1", floor: "Science Building/Ground Floor", capacity: 35, type: "SCIENCE_LABORATORY", equipment: ["Lab benches", "Fume hood"] },
    { number: "SCI2", name: "Science Laboratory 2", floor: "Science Building/Ground Floor", capacity: 35, type: "SCIENCE_LABORATORY", equipment: ["Lab benches"] },
    { number: "BE101", name: "Classroom BE-101", floor: "Basic Education Building/Ground Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "TV"] },
    { number: "BE102", name: "Classroom BE-102", floor: "Basic Education Building/Ground Floor", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "TV"] },
    { number: "BE103", name: "Classroom BE-103", floor: "Basic Education Building/Ground Floor", capacity: 35, type: "LECTURE_ROOM", equipment: ["Whiteboard"] },
    { number: "BE201", name: "Classroom BE-201", floor: "Basic Education Building/2nd Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "TV"] },
    { number: "BE202", name: "Classroom BE-202", floor: "Basic Education Building/2nd Floor", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "TV"] },
    { number: "CONF1", name: "Conference Room A", floor: "Admin Building/Ground Floor", capacity: 20, type: "CONFERENCE_ROOM", equipment: ["Smart TV", "Video Conferencing"] },
  ];
  const roomByNumber: Record<string, { id: string }> = {};
  for (const [i, r] of roomDefs.entries()) {
    roomByNumber[r.number] = await prisma.room.upsert({
      where: { roomNumber: r.number },
      update: { floorId: floorId[r.floor], sortOrder: i },
      create: {
        roomNumber: r.number,
        roomName: r.name,
        floorId: floorId[r.floor],
        sortOrder: i,
        capacity: r.capacity,
        roomType: r.type,
        equipment: r.equipment,
        status: "AVAILABLE",
        availability: { create: SCHOOL_DAYS.map((d) => ({ dayOfWeek: d, startMin: 7 * 60, endMin: 19 * 60 })) },
      },
    });
  }
  // Remove the placeholder building the migration may have created once its rooms are re-homed.
  const unassigned = await prisma.building.findUnique({ where: { name: "Unassigned" }, include: { floors: { include: { rooms: true } } } });
  if (unassigned && unassigned.floors.every((f) => f.rooms.length === 0)) {
    await prisma.building.delete({ where: { id: unassigned.id } });
  }

  // -------------------------------------------------------------------
  // Sections (College, SHS, JHS, Elementary)
  // -------------------------------------------------------------------
  const collegeSections: { name: string; program: string; year: YearLevel; count: number }[] = [
    { name: "BSIT 1A", program: "BSIT", year: "FIRST", count: 38 },
    { name: "BSIT 1B", program: "BSIT", year: "FIRST", count: 35 },
    { name: "BSIT 2A", program: "BSIT", year: "SECOND", count: 34 },
    { name: "BSIT 2B", program: "BSIT", year: "SECOND", count: 30 },
    { name: "BSIT 3A", program: "BSIT", year: "THIRD", count: 32 },
    { name: "BSIT 4A", program: "BSIT", year: "FOURTH", count: 28 },
    { name: "BSCS 1A", program: "BSCS", year: "FIRST", count: 33 },
    { name: "BSCS 2A", program: "BSCS", year: "SECOND", count: 29 },
    { name: "BSCrim 1A", program: "BSCrim", year: "FIRST", count: 42 },
    { name: "BSA 1A", program: "BSA", year: "FIRST", count: 36 },
    { name: "BSBA 1A", program: "BSBA", year: "FIRST", count: 40 },
    { name: "BSTM 1A", program: "BSTM", year: "FIRST", count: 34 },
    { name: "BSISM 1A", program: "BSISM", year: "FIRST", count: 30 },
    { name: "BEED 1A", program: "BEED", year: "FIRST", count: 28 },
    { name: "BSED 1A", program: "BSED", year: "FIRST", count: 25 },
  ];
  const sectionByName: Record<string, { id: string }> = {};
  for (const [i, s] of collegeSections.entries()) {
    sectionByName[s.name] = await upsertSection({
      name: s.name, level: "COLLEGE", yearLevel: s.year, programId: programByCode[s.program].id,
      semesterId: firstSem.id, studentCount: s.count, sortOrder: i,
    });
  }

  const shsSections: { name: string; strand: string; grade: GradeLevel; count: number }[] = [
    { name: "11-STEM A", strand: "STEM", grade: "GRADE_11", count: 40 },
    { name: "11-ABM A", strand: "ABM", grade: "GRADE_11", count: 38 },
    { name: "11-HUMSS A", strand: "HUMSS", grade: "GRADE_11", count: 40 },
    { name: "11-ICT A", strand: "ICT", grade: "GRADE_11", count: 32 },
    { name: "12-STEM A", strand: "STEM", grade: "GRADE_12", count: 36 },
    { name: "12-GAS A", strand: "GAS", grade: "GRADE_12", count: 35 },
    { name: "12-TVL A", strand: "TVL", grade: "GRADE_12", count: 30 },
    { name: "12-IA A", strand: "IA", grade: "GRADE_12", count: 28 },
  ];
  for (const [i, s] of shsSections.entries()) {
    sectionByName[s.name] = await upsertSection({
      name: s.name, level: "SENIOR_HIGH", gradeLevel: s.grade, programId: programByCode[s.strand].id,
      studentCount: s.count, sortOrder: i,
    });
  }

  const basicSections: { name: string; level: AcademicLevel; grade: GradeLevel; count: number }[] = [
    { name: "Grade 7 - Rizal", level: "JUNIOR_HIGH", grade: "GRADE_7", count: 42 },
    { name: "Grade 7 - Bonifacio", level: "JUNIOR_HIGH", grade: "GRADE_7", count: 40 },
    { name: "Grade 8 - Mabini", level: "JUNIOR_HIGH", grade: "GRADE_8", count: 41 },
    { name: "Grade 9 - Luna", level: "JUNIOR_HIGH", grade: "GRADE_9", count: 39 },
    { name: "Grade 10 - Aguinaldo", level: "JUNIOR_HIGH", grade: "GRADE_10", count: 38 },
    { name: "Kinder - Sampaguita", level: "ELEMENTARY", grade: "KINDER", count: 25 },
    { name: "Grade 1 - Rosal", level: "ELEMENTARY", grade: "GRADE_1", count: 32 },
    { name: "Grade 2 - Ilang-Ilang", level: "ELEMENTARY", grade: "GRADE_2", count: 33 },
    { name: "Grade 3 - Gumamela", level: "ELEMENTARY", grade: "GRADE_3", count: 34 },
    { name: "Grade 4 - Dahlia", level: "ELEMENTARY", grade: "GRADE_4", count: 35 },
    { name: "Grade 5 - Orchid", level: "ELEMENTARY", grade: "GRADE_5", count: 34 },
    { name: "Grade 6 - Camia", level: "ELEMENTARY", grade: "GRADE_6", count: 36 },
  ];
  for (const [i, s] of basicSections.entries()) {
    sectionByName[s.name] = await upsertSection({
      name: s.name, level: s.level, gradeLevel: s.grade, studentCount: s.count, sortOrder: i,
    });
  }

  // -------------------------------------------------------------------
  // Subjects
  // -------------------------------------------------------------------
  type SubjectDef = {
    code: string;
    name: string;
    units: number;
    lecture: number;
    lab: number;
    room: RoomType;
    level?: AcademicLevel;
    program?: string;
    year?: YearLevel;
    grade?: GradeLevel;
  };
  const subjectDefs: SubjectDef[] = [
    { code: "GE101", name: "Mathematics in the Modern World", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", year: "FIRST" },
    { code: "GE102", name: "Purposive Communication", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", year: "FIRST" },
    { code: "GE103", name: "Readings in Philippine History", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", year: "FIRST" },
    { code: "GE104", name: "Understanding the Self", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", year: "FIRST" },
    { code: "GCST100", name: "Granby Values", units: 1, lecture: 1, lab: 0, room: "LECTURE_ROOM" },
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

    // Senior High School (strand-specific when `program` is set, otherwise core)
    { code: "SHS-ORALCOM", name: "Oral Communication in Context", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11" },
    { code: "SHS-GENMATH", name: "General Mathematics", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11" },
    { code: "SHS-EARTHSCI", name: "Earth and Life Science", units: 1, lecture: 3, lab: 1, room: "SCIENCE_LABORATORY", level: "SENIOR_HIGH", grade: "GRADE_11" },
    { code: "SHS-PRECAL", name: "Pre-Calculus", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11", program: "STEM" },
    { code: "SHS-BUSMATH", name: "Business Mathematics", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11", program: "ABM" },
    { code: "SHS-CREATIVE", name: "Creative Writing", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_11", program: "HUMSS" },
    { code: "SHS-CSS", name: "Computer Systems Servicing", units: 1, lecture: 1, lab: 3, room: "COMPUTER_LABORATORY", level: "SENIOR_HIGH", grade: "GRADE_11", program: "ICT" },
    { code: "SHS-STATPROB", name: "Statistics and Probability", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_12" },
    { code: "SHS-PR2", name: "Practical Research 2", units: 1, lecture: 4, lab: 0, room: "LECTURE_ROOM", level: "SENIOR_HIGH", grade: "GRADE_12" },
    { code: "SHS-GENBIO", name: "General Biology", units: 1, lecture: 3, lab: 1, room: "SCIENCE_LABORATORY", level: "SENIOR_HIGH", grade: "GRADE_12", program: "STEM" },
  ];

  // Junior High and Elementary core subjects, one set per grade.
  const jhsCore = ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "TLE", "Edukasyon sa Pagpapakatao"];
  for (const g of [7, 8, 9, 10]) {
    for (const name of jhsCore) {
      const isScience = name === "Science";
      subjectDefs.push({
        code: `${name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase()}${g}`,
        name: `${name} ${g}`,
        units: 1,
        lecture: isScience ? 3 : 4,
        lab: isScience ? 1 : 0,
        room: isScience ? "SCIENCE_LABORATORY" : "LECTURE_ROOM",
        level: "JUNIOR_HIGH",
        grade: `GRADE_${g}` as GradeLevel,
      });
    }
  }
  const elemCore = ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "Edukasyon sa Pagpapakatao"];
  subjectDefs.push(
    { code: "K-LITERACY", name: "Kindergarten Literacy", units: 1, lecture: 3, lab: 0, room: "LECTURE_ROOM", level: "ELEMENTARY", grade: "KINDER" },
    { code: "K-NUMERACY", name: "Kindergarten Numeracy", units: 1, lecture: 3, lab: 0, room: "LECTURE_ROOM", level: "ELEMENTARY", grade: "KINDER" },
  );
  for (const g of [1, 2, 3, 4, 5, 6]) {
    for (const name of elemCore) {
      if (name === "Science" && g < 3) continue;
      subjectDefs.push({
        code: `E${g}-${name.replace(/[^A-Za-z]/g, "").slice(0, 5).toUpperCase()}`,
        name: `${name} ${g}`,
        units: 1,
        lecture: 3,
        lab: 0,
        room: "LECTURE_ROOM",
        level: "ELEMENTARY",
        grade: `GRADE_${g}` as GradeLevel,
      });
    }
  }

  const subjectByCode: Record<string, { id: string; lectureHours: number; labHours: number; requiredRoomType: RoomType }> = {};
  for (const [i, s] of subjectDefs.entries()) {
    const level = s.level ?? "COLLEGE";
    subjectByCode[s.code] = await prisma.subject.upsert({
      where: { code: s.code },
      update: { level, gradeLevel: s.grade ?? null, sortOrder: i },
      create: {
        code: s.code,
        name: s.name,
        units: s.units,
        lectureHours: s.lecture,
        labHours: s.lab,
        requiredRoomType: s.room,
        level,
        programId: s.program ? programByCode[s.program].id : undefined,
        yearLevel: s.year,
        gradeLevel: s.grade,
        sortOrder: i,
      },
    });
  }

  // -------------------------------------------------------------------
  // Faculty
  // -------------------------------------------------------------------
  const facultyDefs: {
    employeeId: string;
    fullName: string;
    email: string;
    dept: string;
    position: string;
    specialization: string;
    maxHours: number;
    levels: AcademicLevel[];
  }[] = [
    { employeeId: "F-001", fullName: "Prof. Ana Santos", email: "santos@gcst.edu.ph", dept: "CCS", position: "Associate Professor", specialization: "Programming", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-002", fullName: "Prof. Ramon Reyes", email: "reyes@gcst.edu.ph", dept: "CCS", position: "Assistant Professor", specialization: "Web Development", maxHours: 24, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { employeeId: "F-003", fullName: "Prof. Liza Cruz", email: "cruz@gcst.edu.ph", dept: "CCS", position: "Professor", specialization: "Database", maxHours: 21, levels: ["COLLEGE"] },
    { employeeId: "F-004", fullName: "Prof. Miguel Torres", email: "torres@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Networking", maxHours: 24, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { employeeId: "F-005", fullName: "Prof. Carla Dizon", email: "dizon@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Data Structures", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-006", fullName: "Prof. Noel Villanueva", email: "villanueva@gcst.edu.ph", dept: "CCS", position: "Assistant Professor", specialization: "Information Security", maxHours: 21, levels: ["COLLEGE"] },
    { employeeId: "F-007", fullName: "Prof. Grace Mercado", email: "mercado@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Systems Analysis", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-008", fullName: "Prof. Daniel Ramos", email: "ramos@gcst.edu.ph", dept: "CAS", position: "Professor", specialization: "Mathematics", maxHours: 24, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { employeeId: "F-009", fullName: "Prof. Ella Fernandez", email: "fernandez@gcst.edu.ph", dept: "CAS", position: "Assistant Professor", specialization: "Communication", maxHours: 21, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { employeeId: "F-010", fullName: "Prof. Victor Aquino", email: "aquino@gcst.edu.ph", dept: "CAS", position: "Instructor", specialization: "History", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-011", fullName: "Prof. Sonia Bautista", email: "bautista@gcst.edu.ph", dept: "CAS", position: "Instructor", specialization: "Chemistry", maxHours: 21, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { employeeId: "F-012", fullName: "Prof. Ricardo Lim", email: "lim@gcst.edu.ph", dept: "CBA", position: "Associate Professor", specialization: "Management", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-013", fullName: "Prof. Teresa Navarro", email: "navarro@gcst.edu.ph", dept: "CTE", position: "Assistant Professor", specialization: "Education", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-014", fullName: "Prof. Paolo Garcia", email: "garcia@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Discrete Mathematics", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-015", fullName: "Prof. Mika Alonzo", email: "alonzo@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Automata Theory", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-016", fullName: "Prof. Arnel Castillo", email: "castillo@gcst.edu.ph", dept: "CCJE", position: "Instructor", specialization: "Criminology", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "F-017", fullName: "Prof. Joy Salazar", email: "salazar@gcst.edu.ph", dept: "CBA", position: "Instructor", specialization: "Accounting", maxHours: 24, levels: ["COLLEGE", "SENIOR_HIGH"] },
    { employeeId: "F-018", fullName: "Prof. Karen Ocampo", email: "ocampo@gcst.edu.ph", dept: "CHTM", position: "Instructor", specialization: "Tourism", maxHours: 24, levels: ["COLLEGE"] },
    { employeeId: "T-001", fullName: "Ms. Liza Domingo", email: "domingo@gcst.edu.ph", dept: "BED", position: "Teacher II", specialization: "English", maxHours: 30, levels: ["JUNIOR_HIGH"] },
    { employeeId: "T-002", fullName: "Mr. Jerome Pascual", email: "pascual@gcst.edu.ph", dept: "BED", position: "Teacher I", specialization: "Mathematics", maxHours: 30, levels: ["JUNIOR_HIGH", "SENIOR_HIGH"] },
    { employeeId: "T-003", fullName: "Ms. Rhea Manalo", email: "manalo@gcst.edu.ph", dept: "BED", position: "Teacher III", specialization: "Science", maxHours: 30, levels: ["JUNIOR_HIGH"] },
    { employeeId: "T-004", fullName: "Ms. Joan Velasco", email: "velasco@gcst.edu.ph", dept: "BED", position: "Teacher I", specialization: "Filipino", maxHours: 30, levels: ["ELEMENTARY", "JUNIOR_HIGH"] },
    { employeeId: "T-005", fullName: "Ms. Marites Soriano", email: "soriano@gcst.edu.ph", dept: "BED", position: "Teacher II", specialization: "Early Childhood Education", maxHours: 30, levels: ["ELEMENTARY"] },
    { employeeId: "T-006", fullName: "Mr. Benjie Tolentino", email: "tolentino@gcst.edu.ph", dept: "BED", position: "Teacher I", specialization: "MAPEH", maxHours: 30, levels: ["ELEMENTARY", "JUNIOR_HIGH"] },
  ];

  const facultyByEmployeeId: Record<string, { id: string }> = {};
  for (const f of facultyDefs) {
    facultyByEmployeeId[f.employeeId] = await prisma.faculty.upsert({
      where: { employeeId: f.employeeId },
      update: { teachingLevels: f.levels },
      create: {
        employeeId: f.employeeId,
        fullName: f.fullName,
        email: f.email,
        departmentId: deptByCode[f.dept].id,
        position: f.position,
        specialization: f.specialization,
        maxHours: f.maxHours,
        status: "ACTIVE",
        teachingLevels: f.levels,
        availability: { create: WEEKDAYS.map((d) => ({ dayOfWeek: d, startMin: 7 * 60, endMin: 18 * 60 })) },
      },
    });
  }

  // Prof. Santos: unavailable Friday afternoon (shows an availability warning in the Scheduler).
  const santos = facultyByEmployeeId["F-001"];
  await prisma.facultyAvailability.deleteMany({ where: { facultyId: santos.id, dayOfWeek: "FRIDAY" } });
  await prisma.facultyAvailability.create({
    data: { facultyId: santos.id, dayOfWeek: "FRIDAY", startMin: 7 * 60, endMin: 12 * 60 },
  });

  // -------------------------------------------------------------------
  // Sample timetables (only for sections that have no classes yet)
  // -------------------------------------------------------------------
  type Meeting = { subject: string; faculty: string; room: string; day: DayOfWeek; start: string; end: string; lab?: boolean };
  const sampleTimetables: { section: string; termId: string; meetings: Meeting[] }[] = [
    {
      section: "BSIT 1A",
      termId: firstSem.id,
      meetings: [
        { subject: "GE101", faculty: "F-008", room: "101", day: "MONDAY", start: "08:00", end: "09:30" },
        { subject: "GE101", faculty: "F-008", room: "101", day: "WEDNESDAY", start: "08:00", end: "09:30" },
        { subject: "IT101", faculty: "F-001", room: "201", day: "MONDAY", start: "10:00", end: "12:00" },
        { subject: "IT101", faculty: "F-001", room: "LAB1", day: "THURSDAY", start: "13:00", end: "16:00", lab: true },
        { subject: "IT102", faculty: "F-005", room: "202", day: "TUESDAY", start: "08:00", end: "10:00" },
        { subject: "IT102", faculty: "F-005", room: "LAB2", day: "FRIDAY", start: "08:00", end: "11:00", lab: true },
        { subject: "GE102", faculty: "F-009", room: "101", day: "TUESDAY", start: "13:00", end: "14:30" },
        { subject: "GE102", faculty: "F-009", room: "101", day: "THURSDAY", start: "08:00", end: "09:30" },
      ],
    },
    {
      section: "11-STEM A",
      termId: firstQuarterByLevel.SENIOR_HIGH!.id,
      meetings: [
        { subject: "SHS-ORALCOM", faculty: "F-009", room: "BE201", day: "MONDAY", start: "07:30", end: "08:30" },
        { subject: "SHS-GENMATH", faculty: "F-008", room: "BE201", day: "MONDAY", start: "13:00", end: "14:00" },
        { subject: "SHS-PRECAL", faculty: "T-002", room: "BE201", day: "TUESDAY", start: "07:30", end: "08:30" },
        { subject: "SHS-EARTHSCI", faculty: "F-011", room: "SCI1", day: "WEDNESDAY", start: "13:00", end: "15:00", lab: true },
      ],
    },
    {
      section: "Grade 7 - Rizal",
      termId: firstQuarterByLevel.JUNIOR_HIGH!.id,
      meetings: [
        { subject: "ENGLIS7", faculty: "T-001", room: "BE101", day: "MONDAY", start: "07:30", end: "08:30" },
        { subject: "MATHEM7", faculty: "T-002", room: "BE101", day: "MONDAY", start: "08:30", end: "09:30" },
        { subject: "SCIENC7", faculty: "T-003", room: "BE101", day: "TUESDAY", start: "07:30", end: "08:30" },
        { subject: "FILIPI7", faculty: "T-004", room: "BE101", day: "TUESDAY", start: "08:30", end: "09:30" },
      ],
    },
  ];
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  for (const t of sampleTimetables) {
    const section = sectionByName[t.section];
    if (!section || (await prisma.schedule.count({ where: { sectionId: section.id } })) > 0) continue;
    await prisma.schedule.createMany({
      data: t.meetings
        .filter((m) => subjectByCode[m.subject] && facultyByEmployeeId[m.faculty] && roomByNumber[m.room])
        .map((m) => ({
          semesterId: t.termId,
          sectionId: section.id,
          subjectId: subjectByCode[m.subject].id,
          facultyId: facultyByEmployeeId[m.faculty].id,
          roomId: roomByNumber[m.room].id,
          component: m.lab ? ("LABORATORY" as const) : ("LECTURE" as const),
          dayOfWeek: m.day,
          startMin: toMin(m.start),
          endMin: toMin(m.end),
          status: "PUBLISHED" as const,
        })),
    });
  }

  // -------------------------------------------------------------------
  // Demo accounts (all roles)
  // -------------------------------------------------------------------
  const passwordHash = await hash(DEV_PASSWORD);
  const demoUsers: { email: string; name: string; role: Role; facultyId?: string }[] = [
    { email: "admin@gcst.edu.ph", name: "System Administrator", role: "SUPER_ADMIN" },
    { email: "administrator@gcst.edu.ph", name: "College Administrator", role: "ADMINISTRATOR" },
    { email: "registrar@gcst.edu.ph", name: "College Registrar", role: "REGISTRAR" },
    { email: "scheduler@gcst.edu.ph", name: "Scheduling Officer", role: "SCHEDULER" },
    { email: "faculty@gcst.edu.ph", name: "Prof. Ana Santos", role: "FACULTY", facultyId: santos.id },
    { email: "student@gcst.edu.ph", name: "Demo Student", role: "STUDENT" },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, name: u.name },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        status: "ACTIVE",
        emailVerified: new Date(),
        passwordHash,
        facultyId: u.facultyId,
      },
    });
  }

  // -------------------------------------------------------------------
  // System settings
  // -------------------------------------------------------------------
  await prisma.systemSetting.upsert({
    where: { key: "institution" },
    update: {},
    create: {
      key: "institution",
      value: { name: "Granby Colleges of Science & Technology", shortName: "GCST", location: "Naic, Cavite, Philippines" },
    },
  });

  console.log("Seed complete.");
  console.log(`Demo login password for all demo accounts: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
