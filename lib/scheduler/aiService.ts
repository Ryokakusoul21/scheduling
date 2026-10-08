import { prisma } from "@/lib/db/prisma";
import { toSchedFaculty, toSchedRoom, toSchedSubject, toSchedSection, toSchedEntry } from "./mappers";
import { requestAISchedule, RequiredMeeting } from "@/lib/ai/scheduleAI";
import { checkHardConstraints, checkFacultyWorkloadCap } from "./constraintChecker";
import { scoreSchedule } from "./scheduleScorer";
import { DEFAULT_CONSTRAINTS, SchedEntry, SchedFaculty } from "./types";
import { GenerateForSectionsInput, GenerateForSectionsResult } from "./service";

export async function generateScheduleForSectionsWithAI(
  input: GenerateForSectionsInput
): Promise<GenerateForSectionsResult> {
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
  const schedSections = sections.map(toSchedSection);
  const schedSubjects = subjects.map(toSchedSubject);

  const facultyMinutesUsed = new Map<string, number>();
  for (const e of existingEntries) {
    facultyMinutesUsed.set(e.facultyId, (facultyMinutesUsed.get(e.facultyId) ?? 0) + (e.endMin - e.startMin));
  }
  for (const f of facultyPool) {
    f.assignedHours = (facultyMinutesUsed.get(f.id) ?? 0) / 60;
  }

  const requiredMeetings: RequiredMeeting[] = [];
  for (const section of sections) {
    const relevant = subjects.filter(
      (subj) =>
        (subj.programId === section.programId || subj.programId === null) &&
        (subj.yearLevel === section.yearLevel || subj.yearLevel === null)
    );
    for (const subject of relevant) {
      if (subject.lectureHours > 0) {
        requiredMeetings.push({
          sectionId: section.id,
          subjectId: subject.id,
          component: "LECTURE",
          durationMin: Math.round(subject.lectureHours * 60),
        });
      }
      if (subject.labHours > 0) {
        requiredMeetings.push({
          sectionId: section.id,
          subjectId: subject.id,
          component: "LABORATORY",
          durationMin: Math.round(subject.labHours * 60),
        });
      }
    }
  }

  if (requiredMeetings.length === 0) {
    throw new Error("No subject requirements found for the selected sections.");
  }

  const ai = await requestAISchedule({
    semesterId,
    requiredMeetings,
    sections: schedSections,
    subjects: schedSubjects,
    faculty: facultyPool,
    rooms: roomPool,
    existingEntries,
    constraints: DEFAULT_CONSTRAINTS,
  });

  const roomById = new Map(roomPool.map((r) => [r.id, r]));
  const subjectById = new Map(subjects.map((s) => [s.id, toSchedSubject(s)]));
  const sectionStudentCountById = new Map(sections.map((s) => [s.id, s.studentCount]));

  const scoreBefore = scoreSchedule(existingEntries, { faculty: facultyPool, rooms: roomPool }).overallScore;

  // Re-validate every AI-proposed entry against the same hard-constraint checker the rest of the
  // engine uses - the model's own self-checking claims in the prompt are not trusted on their own.
  // Entries are accepted incrementally (each checked against everything already accepted) so a
  // clean subset can still be saved even if some of the AI's placements are invalid.
  const placed: SchedEntry[] = [...existingEntries];
  const acceptedNew: SchedEntry[] = [];
  const unplaced: { sectionName: string; subjectCode: string; component: string; reason: string }[] = [];
  const workingFacultyById = new Map<string, SchedFaculty>(facultyPool.map((f) => [f.id, { ...f }]));

  for (const entry of ai.entries) {
    const faculty = workingFacultyById.get(entry.facultyId);
    const room = roomById.get(entry.roomId);
    const subject = subjectById.get(entry.subjectId);
    const sectionStudentCount = sectionStudentCountById.get(entry.sectionId);
    const sectionName = schedSections.find((s) => s.id === entry.sectionId)?.name ?? entry.sectionId;
    const subjectCode = subjectById.get(entry.subjectId)?.code ?? entry.subjectId;

    if (!faculty || !room || !subject || sectionStudentCount === undefined) {
      unplaced.push({
        sectionName,
        subjectCode,
        component: entry.component,
        reason: "AI referenced a faculty, room, or subject id that is not part of the available pool.",
      });
      continue;
    }

    const candidate: SchedEntry = {
      subjectId: entry.subjectId,
      sectionId: entry.sectionId,
      facultyId: entry.facultyId,
      roomId: entry.roomId,
      component: entry.component,
      dayOfWeek: entry.dayOfWeek,
      startMin: entry.startMin,
      endMin: entry.endMin,
    };

    const hardViolations = checkHardConstraints(candidate, placed, {
      faculty,
      room,
      subject,
      sectionStudentCount,
    });
    const workloadViolations = checkFacultyWorkloadCap(faculty, (entry.endMin - entry.startMin) / 60);

    if (hardViolations.length > 0 || workloadViolations.length > 0) {
      const rule = hardViolations[0]?.message ?? workloadViolations[0]?.message;
      unplaced.push({
        sectionName,
        subjectCode,
        component: entry.component,
        reason: `AI's proposed placement violated a hard constraint and was rejected: ${rule}`,
      });
      continue;
    }

    placed.push(candidate);
    acceptedNew.push(candidate);
    faculty.assignedHours += (entry.endMin - entry.startMin) / 60;
  }

  for (const u of ai.unscheduled) {
    const sectionName = schedSections.find((s) => s.id === u.sectionId)?.name ?? u.sectionId;
    const subjectCode = subjectById.get(u.subjectId)?.code ?? u.subjectId;
    unplaced.push({ sectionName, subjectCode, component: u.component, reason: u.reason });
  }

  const finalEntries: SchedEntry[] = placed;
  const finalScore = scoreSchedule(finalEntries, { faculty: facultyPool, rooms: roomPool }).overallScore;

  const lastVersion = await prisma.schedule.aggregate({
    where: { semesterId, sectionId: { in: sectionIds } },
    _max: { version: true },
  });
  const version = (lastVersion._max.version ?? 0) + 1;

  await prisma.schedule.createMany({
    data: acceptedNew.map((e) => ({
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
      action: "Generated AI schedule (Gemini)",
      entity: "Schedule",
      newValue: { semesterId, sectionIds, createdCount: acceptedNew.length, version },
    },
  });

  const explanation = [
    `Schedule generated by Gemini using ${requiredMeetings.length} required class meeting(s).`,
    `Placed ${acceptedNew.length} of ${requiredMeetings.length} required class meetings.`,
    `Overall schedule score: ${finalScore}%.`,
    unplaced.length > 0
      ? `${unplaced.length} meeting(s) could not be placed - see the unplaced list below.`
      : "All required meetings were placed with zero hard-constraint violations.",
  ];

  return {
    createdCount: acceptedNew.length,
    unplaced,
    scoreBefore,
    scoreAfter: finalScore,
    movesApplied: 0,
    version,
    explanation,
  };
}
