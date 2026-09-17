import { PrismaClient, RoomType, YearLevel, DayOfWeek, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = "Passw0rd!";

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function main() {
  console.log("Seeding Granby Colleges of Science & Technology scheduling database...");

  // -------------------------------------------------------------------
  // Departments & Programs
  // -------------------------------------------------------------------
  const ccs = await prisma.department.upsert({
    where: { code: "CCS" },
    update: {},
    create: { code: "CCS", name: "College of Computer Studies" },
  });
  const cba = await prisma.department.upsert({
    where: { code: "CBA" },
    update: {},
    create: { code: "CBA", name: "College of Business Administration" },
  });
  const cte = await prisma.department.upsert({
    where: { code: "CTE" },
    update: {},
    create: { code: "CTE", name: "College of Teacher Education" },
  });
  const cas = await prisma.department.upsert({
    where: { code: "CAS" },
    update: {},
    create: { code: "CAS", name: "College of Arts and Sciences" },
  });

  const bsit = await prisma.program.upsert({
    where: { code: "BSIT" },
    update: {},
    create: { code: "BSIT", name: "BS Information Technology", departmentId: ccs.id },
  });
  const bscs = await prisma.program.upsert({
    where: { code: "BSCS" },
    update: {},
    create: { code: "BSCS", name: "BS Computer Science", departmentId: ccs.id },
  });
  const bsba = await prisma.program.upsert({
    where: { code: "BSBA" },
    update: {},
    create: { code: "BSBA", name: "BS Business Administration", departmentId: cba.id },
  });
  const bsed = await prisma.program.upsert({
    where: { code: "BSED" },
    update: {},
    create: { code: "BSED", name: "Bachelor of Secondary Education", departmentId: cte.id },
  });

  // -------------------------------------------------------------------
  // Academic Year & Semesters
  // -------------------------------------------------------------------
  const ay2526 = await prisma.academicYear.upsert({
    where: { name: "2025-2026" },
    update: { isActive: true },
    create: {
      name: "2025-2026",
      startDate: new Date("2025-08-01"),
      endDate: new Date("2026-06-30"),
      isActive: true,
    },
  });
  await prisma.academicYear.upsert({
    where: { name: "2024-2025" },
    update: {},
    create: {
      name: "2024-2025",
      startDate: new Date("2024-08-01"),
      endDate: new Date("2025-06-30"),
      isActive: false,
    },
  });

  const firstSem = await prisma.semester.upsert({
    where: { academicYearId_type: { academicYearId: ay2526.id, type: "FIRST" } },
    update: { isActive: true },
    create: {
      academicYearId: ay2526.id,
      type: "FIRST",
      name: "First Semester",
      startDate: new Date("2025-08-01"),
      endDate: new Date("2025-12-15"),
      isActive: true,
    },
  });
  await prisma.semester.upsert({
    where: { academicYearId_type: { academicYearId: ay2526.id, type: "SECOND" } },
    update: {},
    create: {
      academicYearId: ay2526.id,
      type: "SECOND",
      name: "Second Semester",
      startDate: new Date("2026-01-05"),
      endDate: new Date("2026-05-15"),
      isActive: false,
    },
  });
  await prisma.semester.upsert({
    where: { academicYearId_type: { academicYearId: ay2526.id, type: "SUMMER" } },
    update: {},
    create: {
      academicYearId: ay2526.id,
      type: "SUMMER",
      name: "Summer",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-30"),
      isActive: false,
    },
  });

  // -------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------
  const sectionDefs: { name: string; program: string; year: YearLevel; count: number }[] = [
    { name: "BSIT 1A", program: "BSIT", year: "FIRST", count: 38 },
    { name: "BSIT 1B", program: "BSIT", year: "FIRST", count: 35 },
    { name: "BSIT 2A", program: "BSIT", year: "SECOND", count: 34 },
    { name: "BSIT 2B", program: "BSIT", year: "SECOND", count: 30 },
    { name: "BSIT 3A", program: "BSIT", year: "THIRD", count: 32 },
    { name: "BSIT 4A", program: "BSIT", year: "FOURTH", count: 28 },
    { name: "BSCS 1A", program: "BSCS", year: "FIRST", count: 33 },
    { name: "BSCS 2A", program: "BSCS", year: "SECOND", count: 29 },
    { name: "BSBA 1A", program: "BSBA", year: "FIRST", count: 40 },
    { name: "BSED 1A", program: "BSED", year: "FIRST", count: 25 },
  ];
  const programByCode: Record<string, { id: string }> = { BSIT: bsit, BSCS: bscs, BSBA: bsba, BSED: bsed };

  const sections: { id: string; name: string; programCode: string }[] = [];
  for (const s of sectionDefs) {
    const section = await prisma.section.upsert({
      where: { name_semesterId: { name: s.name, semesterId: firstSem.id } },
      update: {},
      create: {
        name: s.name,
        yearLevel: s.year,
        studentCount: s.count,
        programId: programByCode[s.program].id,
        semesterId: firstSem.id,
      },
    });
    sections.push({ id: section.id, name: section.name, programCode: s.program });
  }

  // -------------------------------------------------------------------
  // Subjects
  // -------------------------------------------------------------------
  const subjectDefs: {
    code: string;
    name: string;
    units: number;
    lecture: number;
    lab: number;
    room: RoomType;
    program?: string;
    year?: YearLevel;
  }[] = [
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
    { code: "BA101", name: "Principles of Management", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSBA", year: "FIRST" },
    { code: "ED101", name: "The Teaching Profession", units: 3, lecture: 3, lab: 0, room: "LECTURE_ROOM", program: "BSED", year: "FIRST" },
  ];

  const subjects: { id: string; code: string }[] = [];
  for (const s of subjectDefs) {
    const subject = await prisma.subject.upsert({
      where: { code: s.code },
      update: {},
      create: {
        code: s.code,
        name: s.name,
        units: s.units,
        lectureHours: s.lecture,
        labHours: s.lab,
        requiredRoomType: s.room,
        programId: s.program ? programByCode[s.program].id : undefined,
        yearLevel: s.year,
      },
    });
    subjects.push({ id: subject.id, code: subject.code });
  }

  // -------------------------------------------------------------------
  // Rooms
  // -------------------------------------------------------------------
  const roomDefs: { number: string; name: string; building: string; capacity: number; type: RoomType; equipment: string[] }[] = [
    { number: "101", name: "Room 101", building: "Main Building", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "102", name: "Room 102", building: "Main Building", capacity: 45, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "201", name: "Room 201", building: "Main Building", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "202", name: "Room 202", building: "Main Building", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard"] },
    { number: "301", name: "Room 301", building: "Main Building", capacity: 40, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector", "Aircon"] },
    { number: "302", name: "Room 302", building: "Main Building", capacity: 35, type: "LECTURE_ROOM", equipment: ["Whiteboard"] },
    { number: "LAB1", name: "Computer Laboratory 1", building: "IT Building", capacity: 40, type: "COMPUTER_LABORATORY", equipment: ["40 PCs", "Projector", "Aircon"] },
    { number: "LAB2", name: "Computer Laboratory 2", building: "IT Building", capacity: 40, type: "COMPUTER_LABORATORY", equipment: ["40 PCs", "Projector", "Aircon"] },
    { number: "LAB3", name: "Computer Laboratory 3", building: "IT Building", capacity: 35, type: "COMPUTER_LABORATORY", equipment: ["35 PCs", "Projector"] },
    { number: "LAB4", name: "Computer Laboratory 4", building: "IT Building", capacity: 30, type: "COMPUTER_LABORATORY", equipment: ["30 PCs"] },
    { number: "SCI1", name: "Science Laboratory 1", building: "Science Building", capacity: 35, type: "SCIENCE_LABORATORY", equipment: ["Lab benches", "Fume hood"] },
    { number: "SCI2", name: "Science Laboratory 2", building: "Science Building", capacity: 35, type: "SCIENCE_LABORATORY", equipment: ["Lab benches"] },
    { number: "CONF1", name: "Conference Room A", building: "Admin Building", capacity: 20, type: "CONFERENCE_ROOM", equipment: ["Smart TV", "Video Conferencing"] },
    { number: "303", name: "Room 303", building: "Main Building", capacity: 38, type: "LECTURE_ROOM", equipment: ["Whiteboard", "Projector"] },
    { number: "LAB5", name: "Computer Laboratory 5", building: "IT Building", capacity: 40, type: "COMPUTER_LABORATORY", equipment: ["40 PCs", "Projector"] },
  ];

  const rooms: { id: string }[] = [];
  for (const r of roomDefs) {
    const room = await prisma.room.upsert({
      where: { roomNumber: r.number },
      update: {},
      create: {
        roomNumber: r.number,
        roomName: r.name,
        building: r.building,
        capacity: r.capacity,
        roomType: r.type,
        equipment: r.equipment,
        status: "AVAILABLE",
        availability: {
          create: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as DayOfWeek[]).map((d) => ({
            dayOfWeek: d,
            startMin: 7 * 60,
            endMin: 19 * 60,
          })),
        },
      },
    });
    rooms.push(room);
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
  }[] = [
    { employeeId: "F-001", fullName: "Prof. Ana Santos", email: "santos@gcst.edu.ph", dept: "CCS", position: "Associate Professor", specialization: "Programming", maxHours: 24 },
    { employeeId: "F-002", fullName: "Prof. Ramon Reyes", email: "reyes@gcst.edu.ph", dept: "CCS", position: "Assistant Professor", specialization: "Web Development", maxHours: 24 },
    { employeeId: "F-003", fullName: "Prof. Liza Cruz", email: "cruz@gcst.edu.ph", dept: "CCS", position: "Professor", specialization: "Database", maxHours: 21 },
    { employeeId: "F-004", fullName: "Prof. Miguel Torres", email: "torres@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Networking", maxHours: 24 },
    { employeeId: "F-005", fullName: "Prof. Carla Dizon", email: "dizon@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Data Structures", maxHours: 24 },
    { employeeId: "F-006", fullName: "Prof. Noel Villanueva", email: "villanueva@gcst.edu.ph", dept: "CCS", position: "Assistant Professor", specialization: "Information Security", maxHours: 21 },
    { employeeId: "F-007", fullName: "Prof. Grace Mercado", email: "mercado@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Systems Analysis", maxHours: 24 },
    { employeeId: "F-008", fullName: "Prof. Daniel Ramos", email: "ramos@gcst.edu.ph", dept: "CAS", position: "Professor", specialization: "Mathematics", maxHours: 24 },
    { employeeId: "F-009", fullName: "Prof. Ella Fernandez", email: "fernandez@gcst.edu.ph", dept: "CAS", position: "Assistant Professor", specialization: "Communication", maxHours: 21 },
    { employeeId: "F-010", fullName: "Prof. Victor Aquino", email: "aquino@gcst.edu.ph", dept: "CAS", position: "Instructor", specialization: "History", maxHours: 24 },
    { employeeId: "F-011", fullName: "Prof. Sonia Bautista", email: "bautista@gcst.edu.ph", dept: "CAS", position: "Instructor", specialization: "Chemistry", maxHours: 21 },
    { employeeId: "F-012", fullName: "Prof. Ricardo Lim", email: "lim@gcst.edu.ph", dept: "CBA", position: "Associate Professor", specialization: "Management", maxHours: 24 },
    { employeeId: "F-013", fullName: "Prof. Teresa Navarro", email: "navarro@gcst.edu.ph", dept: "CTE", position: "Assistant Professor", specialization: "Education", maxHours: 24 },
    { employeeId: "F-014", fullName: "Prof. Paolo Garcia", email: "garcia@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Discrete Mathematics", maxHours: 24 },
    { employeeId: "F-015", fullName: "Prof. Mika Alonzo", email: "alonzo@gcst.edu.ph", dept: "CCS", position: "Instructor", specialization: "Automata Theory", maxHours: 24 },
  ];
  const deptByCode: Record<string, { id: string }> = { CCS: ccs, CBA: cba, CTE: cte, CAS: cas };

  const facultyIds: string[] = [];
  for (const f of facultyDefs) {
    const faculty = await prisma.faculty.upsert({
      where: { employeeId: f.employeeId },
      update: {},
      create: {
        employeeId: f.employeeId,
        fullName: f.fullName,
        email: f.email,
        departmentId: deptByCode[f.dept].id,
        position: f.position,
        specialization: f.specialization,
        maxHours: f.maxHours,
        status: "ACTIVE",
        availability: {
          create: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as DayOfWeek[]).map((d) => ({
            dayOfWeek: d,
            startMin: 7 * 60,
            endMin: 18 * 60,
          })),
        },
      },
    });
    facultyIds.push(faculty.id);
  }

  // Prof. Santos: unavailable Friday afternoon (used in the AI natural-language demo)
  const santos = await prisma.faculty.findUnique({ where: { employeeId: "F-001" } });
  if (santos) {
    await prisma.facultyAvailability.deleteMany({ where: { facultyId: santos.id, dayOfWeek: "FRIDAY" } });
    await prisma.facultyAvailability.create({
      data: { facultyId: santos.id, dayOfWeek: "FRIDAY", startMin: 7 * 60, endMin: 12 * 60 },
    });
  }

  // -------------------------------------------------------------------
  // Students
  // -------------------------------------------------------------------
  const firstNames = [
    "Juan", "Maria", "Jose", "Ana", "Pedro", "Rosa", "Carlos", "Elena", "Luis", "Carmen",
    "Antonio", "Sofia", "Manuel", "Isabel", "Francisco", "Teresa", "Rafael", "Patricia", "Miguel", "Angela",
    "Ramon", "Cristina", "Fernando", "Gloria", "Ricardo", "Beatriz", "Eduardo", "Veronica", "Alberto", "Diana",
    "Enrique", "Monica", "Roberto", "Lourdes", "Arturo", "Susana", "Gabriel", "Lucia", "Emilio", "Adela",
    "Nestor", "Rita", "Oscar", "Yolanda", "Hector", "Norma", "Ernesto", "Julia", "Vicente", "Marilyn",
  ];
  const lastNames = [
    "Dela Cruz", "Reyes", "Santos", "Bautista", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Villanueva",
  ];

  let studentCounter = 1;
  const studentSeeds: { id: string; email: string }[] = [];
  for (const section of sections) {
    const studentsPerSection = 5;
    for (let i = 0; i < studentsPerSection; i++) {
      const fn = firstNames[(studentCounter - 1) % firstNames.length];
      const ln = lastNames[(studentCounter - 1) % lastNames.length];
      const studentNumber = `2025-${String(studentCounter).padStart(5, "0")}`;
      const email = `student${studentCounter}@gcst.edu.ph`;
      const student = await prisma.student.upsert({
        where: { studentNumber },
        update: {},
        create: {
          studentNumber,
          fullName: `${fn} ${ln}`,
          email,
          programId: programByCode[section.programCode].id,
          sectionId: section.id,
          status: "ACTIVE",
        },
      });
      studentSeeds.push({ id: student.id, email: student.email });
      studentCounter++;
    }
  }

  // -------------------------------------------------------------------
  // Demo accounts (all roles)
  // -------------------------------------------------------------------
  const passwordHash = await hash(DEV_PASSWORD);
  const demoUsers: { email: string; name: string; role: Role; facultyId?: string; studentId?: string }[] = [
    { email: "admin@gcst.edu.ph", name: "System Administrator", role: "SUPER_ADMIN" },
    { email: "administrator@gcst.edu.ph", name: "College Administrator", role: "ADMINISTRATOR" },
    { email: "registrar@gcst.edu.ph", name: "College Registrar", role: "REGISTRAR" },
    { email: "scheduler@gcst.edu.ph", name: "Scheduling Officer", role: "SCHEDULER" },
    { email: "faculty@gcst.edu.ph", name: "Prof. Ana Santos", role: "FACULTY", facultyId: santos?.id },
    { email: "student@gcst.edu.ph", name: "Demo Student", role: "STUDENT", studentId: studentSeeds[0]?.id },
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
        passwordHash,
        facultyId: u.facultyId,
        studentId: u.studentId,
      },
    });
  }

  // -------------------------------------------------------------------
  // Scheduling constraints (soft constraint weights, configurable by admins)
  // -------------------------------------------------------------------
  const constraintDefs: { name: string; type: "HARD" | "SOFT"; weight: number; config?: object }[] = [
    { name: "FACULTY_DOUBLE_BOOK", type: "HARD", weight: 1 },
    { name: "ROOM_DOUBLE_BOOK", type: "HARD", weight: 1 },
    { name: "SECTION_DOUBLE_BOOK", type: "HARD", weight: 1 },
    { name: "ROOM_CAPACITY", type: "HARD", weight: 1 },
    { name: "FACULTY_AVAILABILITY", type: "HARD", weight: 1 },
    { name: "ROOM_AVAILABILITY", type: "HARD", weight: 1 },
    { name: "SUBJECT_ROOM_TYPE", type: "HARD", weight: 1 },
    { name: "FACULTY_MAX_HOURS", type: "HARD", weight: 1 },
    { name: "AVOID_EARLY_MORNING", type: "SOFT", weight: 0.6, config: { beforeMin: 8 * 60 } },
    { name: "AVOID_LATE_EVENING", type: "SOFT", weight: 0.6, config: { afterMin: 18 * 60 } },
    { name: "BALANCE_FACULTY_WORKLOAD", type: "SOFT", weight: 1 },
    { name: "MINIMIZE_ROOM_IDLE_TIME", type: "SOFT", weight: 0.8 },
    { name: "PREFER_CONSECUTIVE_SCHEDULES", type: "SOFT", weight: 0.7 },
    { name: "MINIMIZE_STUDENT_GAPS", type: "SOFT", weight: 0.7 },
  ];
  for (const c of constraintDefs) {
    await prisma.schedulingConstraint.upsert({
      where: { name: c.name },
      update: { type: c.type, weight: c.weight, config: c.config },
      create: { name: c.name, type: c.type, weight: c.weight, config: c.config, isActive: true },
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
      value: {
        name: "Granby Colleges of Science & Technology",
        shortName: "GCST",
        location: "Naic, Cavite, Philippines",
      },
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
