import { prisma } from "@/lib/db/prisma";
import { toSchedFaculty, toSchedRoom, toSchedSubject, toSchedSection, toSchedEntry } from "./mappers";
import { generateSchedule, SubjectAssignment } from "./scheduleGenerator";
import { optimizeSchedule } from "./scheduleOptimizer";
import { scoreSchedule } from "./scheduleScorer";
import { validateSchedule } from "./scheduleValidator";
import { DEFAULT_CONSTRAINTS, SchedEntry } from "./types";

export interface GenerateForSectionsInput {
  semesterId: string;
  sectionIds: string[];
  generatedBy: string;
}

export interface GenerateForSectionsResult {
  createdCount: number;
  unplaced: { sectionName: string; subjectCode: string; component: string; reason: string }[];
  scoreBefore: number;
  scoreAfter: number;
  movesApplied: number;
  version: number;
  explanation: string[];
}

export async function generateScheduleForSections(input: GenerateForSectionsInput): Promise<GenerateForSectionsResult> {
  const { semesterId, sectionIds, generatedBy } = input;

  const [sections, facultyRows, roomRows, existingRows] = await Promise.all([
    prisma.section.findMany({ where: { id: { in: sectionIds } }, include: { program: true } }),
    prisma.faculty.findMany({ where: { status: "ACTIVE" }, include: { availability: true } }),
    prisma.room.findMany({ where: { status: "AVAILABLE" }, include: { availability: true } }),
    prisma.schedule.findMany({ where: { semesterId, status: { not: "ARCHIVED" } } }),
  ]);

  if (sections.length === 0) {
    throw new Error("No matching sections found for the given semester.");
  }

  const subjectWhere = {
    OR: sections.flatMap((s) => [
      { programId: s.programId, yearLevel: s.yearLevel },
      { programId: s.programId, yearLevel: null },
      { programId: null, yearLevel: s.yearLevel },
      { programId: null, yearLevel: null },
    ]),
  };
  const subjects = await prisma.subject.findMany({ where: subjectWhere });

  const facultyPool = facultyRows.map((f) => toSchedFaculty(f));
  const roomPool = roomRows.map(toSchedRoom);
  const existingEntries = existingRows.map(toSchedEntry);

  const assignments: SubjectAssignment[] = [];
  for (const section of sections) {
    const schedSection = toSchedSection(section);
    const relevant = subjects.filter(
      (subj) =>
        (subj.programId === section.programId || subj.programId === null) &&
        (subj.yearLevel === section.yearLevel || subj.yearLevel === null)
    );
    for (const subject of relevant) {
      assignments.push({ section: schedSection, subject: toSchedSubject(subject) });
    }
  }

  // Faculty workload already assigned this semester (so the cap is respected across runs).
  const facultyMinutesUsed = new Map<string, number>();
  for (const e of existingEntries) {
    facultyMinutesUsed.set(e.facultyId, (facultyMinutesUsed.get(e.facultyId) ?? 0) + (e.endMin - e.startMin));
  }
  for (const f of facultyPool) {
    f.assignedHours = (facultyMinutesUsed.get(f.id) ?? 0) / 60;
  }

  const { entries: generatedEntries, unplaced } = generateSchedule(
    assignments,
    facultyPool,
    roomPool,
    existingEntries,
    DEFAULT_CONSTRAINTS
  );

  const facultyById = new Map(facultyPool.map((f) => [f.id, f]));
  const roomById = new Map(roomPool.map((r) => [r.id, r]));
  const subjectById = new Map(subjects.map((s) => [s.id, toSchedSubject(s)]));
  const sectionStudentCountById = new Map(sections.map((s) => [s.id, s.studentCount]));

  const scoreBefore = scoreSchedule([...existingEntries, ...generatedEntries], {
    faculty: facultyPool,
    rooms: roomPool,
  }).overallScore;

  const { entries: optimizedNewEntries, scoreAfter, movesApplied } = optimizeSchedule(
    generatedEntries,
    { facultyById, roomById, subjectById, sectionStudentCountById, facultyPool, roomPool },
    3
  );

  const finalEntries: SchedEntry[] = [...existingEntries, ...optimizedNewEntries];
  const violations = validateSchedule(finalEntries, { facultyById, roomById, subjectById, sectionStudentCountById });
  if (violations.length > 0) {
    throw new Error(
      `Internal scheduling error: generated schedule failed final hard-constraint validation (${violations.length} violation(s)). No changes were saved.`
    );
  }

  const lastVersion = await prisma.schedule.aggregate({
    where: { semesterId, sectionId: { in: sectionIds } },
    _max: { version: true },
  });
  const version = (lastVersion._max.version ?? 0) + 1;

  const finalScore = scoreSchedule(finalEntries, { faculty: facultyPool, rooms: roomPool }).overallScore;

  await prisma.schedule.createMany({
    data: optimizedNewEntries.map((e) => ({
      semesterId,
      subjectId: e.subjectId,
      sectionId: e.sectionId,
      facultyId: e.facultyId,
      roomId: e.roomId,
      component: e.component,
      dayOfWeek: e.dayOfWeek,
      startMin: e.startMin,
      endMin: e.endMin,
      status: "DRAFT" as const,
      version,
      generatedBy,
      score: finalScore,
    })),
  });

  await prisma.auditLog.create({
    data: {
      userId: generatedBy,
      action: "Generated AI schedule",
      entity: "Schedule",
      newValue: { semesterId, sectionIds, createdCount: optimizedNewEntries.length, version },
    },
  });

  const explanation = [
    `Schedule generated using ${assignments.length} subject-section requirement(s).`,
    `Placed ${optimizedNewEntries.length} of ${optimizedNewEntries.length + unplaced.length} required class meetings.`,
    `Optimizer applied ${movesApplied} improving move(s), raising the score from ${scoreBefore}% to ${scoreAfter}%.`,
    unplaced.length > 0
      ? `${unplaced.length} meeting(s) could not be placed - see the unplaced list below.`
      : "All required meetings were placed with zero hard-constraint violations.",
  ];

  return {
    createdCount: optimizedNewEntries.length,
    unplaced,
    scoreBefore,
    scoreAfter: finalScore,
    movesApplied,
    version,
    explanation,
  };
}
