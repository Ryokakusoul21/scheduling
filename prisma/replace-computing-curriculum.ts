import type { Prisma, PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { COMPUTING_ACADEMIC_YEAR, COMPUTING_CURRICULA, computingSubjects } from "./computing-curriculum";
import { curriculumProgramWhere } from "../lib/subjects/curriculum";

const sourceCodes = computingSubjects().map((subject) => subject.code);
const programCodes = COMPUTING_CURRICULA.map((program) => program.code);
const reason = "Replaced by supplied computing curricula, First Semester 2026-2027.";

async function readState(db: Prisma.TransactionClient) {
  const programs = await db.program.findMany({ where: { level: "COLLEGE" } });
  const targets = programs.filter((program) => programCodes.includes(program.code as "BSCS" | "BSIT"));
  if (targets.length !== 2) throw new Error("Both computing programs must exist before importing.");
  const terms = await db.semester.findMany({ where: { level: "COLLEGE", type: "FIRST", academicYear: { name: COMPUTING_ACADEMIC_YEAR }, OR: [{ programId: null }, { programId: { in: targets.map((program) => program.id) } }] } });
  if (!terms.length) throw new Error("First Semester 2026-2027 must exist before importing.");
  const sections = await db.section.findMany({ where: { programId: { in: targets.map((program) => program.id) }, semesterId: { in: terms.map((term) => term.id) } }, orderBy: { archivedAt: "desc" } });
  const sectionIds = sections.map((section) => section.id);
  const subjects = await db.subject.findMany({ where: { level: "COLLEGE", OR: [{ programId: { in: targets.map((program) => program.id) } }, { programId: null }, { code: { in: sourceCodes } }] }, include: { sharedPrograms: { select: { id: true } } } });
  const [schedules, examinations, assignments, placeholders, submissions] = await Promise.all([
    db.schedule.findMany({ where: { sectionId: { in: sectionIds } } }),
    db.examination.findMany({ where: { sectionId: { in: sectionIds } } }),
    db.subjectAssignment.findMany({ where: { OR: [{ sectionId: { in: sectionIds } }, { sectionId: null, semesterId: { in: terms.map((term) => term.id) }, subject: { programId: { in: targets.map((program) => program.id) } } }] } }),
    db.sectionClassPlaceholder.findMany({ where: { sectionId: { in: sectionIds } } }),
    db.timetableSubmission.findMany({ where: { departmentId: { in: targets.flatMap((program) => program.departmentId ? [program.departmentId] : []) }, semesterId: { in: terms.map((term) => term.id) } } }),
  ]);
  return { programs, targets, terms, sections, subjects, schedules, examinations, assignments, placeholders, submissions };
}

export async function previewComputingCurriculum(db: PrismaClient) {
  const state = await readState(db);
  return {
    academicYear: COMPUTING_ACADEMIC_YEAR, semester: "FIRST", uniqueSubjects: sourceCodes.length,
    programs: COMPUTING_CURRICULA.map((program) => ({ code: program.code, years: program.years.map((year) => ({ year: year.yearLevel, subjects: year.subjects.length, units: year.totalUnits, sections: year.sections })) })),
    existingSections: state.sections.filter((section) => !section.archivedAt).length,
    existingClassMeetings: state.schedules.filter((schedule) => schedule.status !== "ARCHIVED").length,
    weeklyHours: "New subjects remain unconfigured (zero lecture and laboratory hours).",
  };
}

export async function verifyComputingCurriculum(db: Prisma.TransactionClient) {
  const report = [];
  for (const curriculum of COMPUTING_CURRICULA) {
    const program = await db.program.findUniqueOrThrow({ where: { code: curriculum.code } });
    for (const year of curriculum.years) {
      const subjects = await db.subject.findMany({ where: { archivedAt: null, level: "COLLEGE", semester: "FIRST", AND: [curriculumProgramWhere(program.id), { OR: [{ yearLevel: year.yearLevel }, { yearLevel: null }] }] }, select: { code: true, name: true, units: true } });
      const actual = subjects.map((subject) => JSON.stringify([subject.code, subject.name, subject.units])).sort();
      const expected = year.subjects.map((subject) => JSON.stringify(subject)).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Imported subjects do not match ${curriculum.code} ${year.yearLevel}.`);
      const sections = await db.section.count({ where: { archivedAt: null, programId: program.id, yearLevel: year.yearLevel, semester: { type: "FIRST", academicYear: { name: COMPUTING_ACADEMIC_YEAR } } } });
      if (sections !== year.sections) throw new Error(`Section count does not match ${curriculum.code} ${year.yearLevel}.`);
      report.push({ program: curriculum.code, year: year.yearLevel, subjects: subjects.length, units: subjects.reduce((sum, subject) => sum + subject.units, 0), sections });
    }
  }
  return report;
}

/** Replaces only the supplied programs and semester, archiving superseded records and retaining their links. */
export async function replaceComputingCurriculum(db: PrismaClient) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261114, 2027)`;
    const state = await readState(tx);
    const targetIds = state.targets.map((program) => program.id);
    const otherProgramIds = state.programs.filter((program) => !targetIds.includes(program.id)).map((program) => program.id);
    const gened = await tx.department.findUnique({ where: { code: "GENED" }, select: { id: true } });
    if (!gened) throw new Error("The General Education Department must exist before importing.");
    for (const subject of state.subjects.filter((subject) => sourceCodes.includes(subject.code))) {
      if (subject.programId && !targetIds.includes(subject.programId) || subject.sharedPrograms.some((program) => !targetIds.includes(program.id))) throw new Error(`Subject code ${subject.code} is already used outside these programs.`);
    }

    const directory = resolve("uploads/curriculum-backups");
    await mkdir(directory, { recursive: true });
    const backupPath = resolve(directory, `computing-2026-2027-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify({ reason, savedAt: new Date().toISOString(), ...state }, null, 2), { flag: "wx" });

    const now = new Date();
    const subjectIds = new Map<string, string>();
    for (const subject of computingSubjects()) {
      const programs = state.targets.filter((program) => subject.programs.includes(program.code));
      const minor = /^(GE|GVAL|PATHFIT|CWTS|NSTP)/.test(subject.code);
      const data = {
        name: subject.name, units: subject.units, yearLevel: subject.yearLevel, level: "COLLEGE" as const,
        semester: "FIRST" as const, gradeLevel: null, category: minor ? "MINOR" as const : "MAJOR" as const,
        programId: !minor && programs.length === 1 ? programs[0].id : null,
        departmentId: minor ? gened.id : programs[0].departmentId,
        sortOrder: subject.sortOrder, archivedAt: null, archivedById: null, archiveReason: null,
        sharedPrograms: { set: programs.map((program) => ({ id: program.id })) },
      };
      const row = await tx.subject.upsert({ where: { code: subject.code },
        create: { ...data, code: subject.code, lectureHours: 0, labHours: 0, requiredRoomType: "LECTURE_ROOM", sharedPrograms: { connect: programs.map((program) => ({ id: program.id })) } },
        update: data,
      });
      subjectIds.set(subject.code, row.id);
    }

    const allowedBySection = new Map<string, Set<string>>();
    const selectedIds = new Set<string>();
    for (const curriculum of COMPUTING_CURRICULA) {
      const program = state.targets.find((program) => program.code === curriculum.code)!;
      const term = state.terms.find((term) => term.programId === program.id) ?? state.terms.find((term) => !term.programId)!;
      if (!term) throw new Error(`No matching term for ${program.code}.`);
      for (const [yearIndex, year] of curriculum.years.entries()) {
        for (let index = 0; index < year.sections; index++) {
          const suffix = `${yearIndex + 1}-${String.fromCharCode(65 + index)}`;
          const candidates = state.sections.filter((section) => section.programId === program.id && section.semesterId === term.id && section.yearLevel === year.yearLevel && section.name.replace(/(\d)([A-Z])$/, "$1-$2").endsWith(suffix));
          const existing = candidates.find((section) => !section.archivedAt) ?? candidates[0];
          const section = existing
            ? await tx.section.update({ where: { id: existing.id }, data: { archivedAt: null, archiveReason: null, archivedById: null } })
            : await tx.section.create({ data: { name: `${program.name} ${suffix}`, level: "COLLEGE", programId: program.id, departmentId: program.departmentId, yearLevel: year.yearLevel, semesterId: term.id, studentCount: 0, sortOrder: yearIndex * 10 + index } });
          selectedIds.add(section.id);
          allowedBySection.set(section.id, new Set(year.subjects.map(([code]) => subjectIds.get(code)!)));
        }
      }
    }

    const obsolete = (sectionId: string, subjectId: string) => !allowedBySection.get(sectionId)?.has(subjectId);
    const oldSchedules = state.schedules.filter((row) => row.status !== "ARCHIVED" && obsolete(row.sectionId, row.subjectId));
    const oldExams = state.examinations.filter((row) => row.status !== "ARCHIVED" && obsolete(row.sectionId, row.subjectId));
    const oldAssignments = state.assignments.filter((row) => row.status === "ACTIVE" && (row.sectionId ? obsolete(row.sectionId, row.subjectId) : ![...subjectIds.values()].includes(row.subjectId)));
    await tx.schedule.updateMany({ where: { id: { in: oldSchedules.map((row) => row.id) } }, data: { status: "ARCHIVED" } });
    await tx.examination.updateMany({ where: { id: { in: oldExams.map((row) => row.id) } }, data: { status: "ARCHIVED" } });
    await tx.subjectAssignment.updateMany({ where: { id: { in: oldAssignments.map((row) => row.id) } }, data: { status: "ARCHIVED" } });
    await tx.sectionClassPlaceholder.deleteMany({ where: { id: { in: state.placeholders.filter((row) => obsolete(row.sectionId, row.subjectId)).map((row) => row.id) } } });
    await tx.section.updateMany({ where: { id: { in: state.sections.filter((section) => !selectedIds.has(section.id) && !section.archivedAt).map((section) => section.id) } }, data: { archivedAt: now, archiveReason: reason } });

    const supersededIds = state.subjects.filter((subject) => !sourceCodes.includes(subject.code) && (!subject.semester || subject.semester === "FIRST") && !!subject.programId && targetIds.includes(subject.programId)).map((subject) => subject.id);
    await tx.subject.updateMany({ where: { id: { in: supersededIds }, archivedAt: null }, data: { archivedAt: now, archiveReason: reason } });
    for (const subject of state.subjects.filter((subject) => !sourceCodes.includes(subject.code) && !subject.programId && (!subject.semester || subject.semester === "FIRST"))) {
      await tx.subject.update({ where: { id: subject.id }, data: { sharedPrograms: { set: otherProgramIds.map((id) => ({ id })) } } });
    }
    const affectedSubmissions = [...new Set([...oldSchedules, ...oldExams].flatMap((row) => row.submissionId ? [row.submissionId] : []))];
    // A submitted package is withdrawn only when every live row belongs to the replaced curricula.
    for (const id of affectedSubmissions) {
      const outside = await tx.timetableSubmission.count({ where: { id, OR: [{ schedules: { some: { status: { not: "ARCHIVED" } } } }, { examinations: { some: { status: { not: "ARCHIVED" } } } }] } });
      if (!outside) await tx.timetableSubmission.updateMany({ where: { id, status: { in: ["SUBMITTED", "APPROVED"] } }, data: { status: "WITHDRAWN", reason, decidedAt: now } });
    }
    await verifyComputingCurriculum(tx);
    const result = { subjects: subjectIds.size, sections: selectedIds.size, archivedClassMeetings: oldSchedules.length, archivedExaminations: oldExams.length, archivedAssignments: oldAssignments.length, backupPath };
    await tx.auditLog.create({ data: { action: "Replaced computing curricula from supplied subject images", entity: "Subject", reason, newValue: { academicYear: COMPUTING_ACADEMIC_YEAR, semester: "FIRST", ...result } } });
    return result;
  }, { timeout: 120000, maxWait: 10000 });
}
