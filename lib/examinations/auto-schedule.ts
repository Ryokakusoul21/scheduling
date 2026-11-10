import { ACADEMIC_LEVELS, GRADE_LEVELS, YEAR_LEVELS, gradeLabel, levelLabel, yearLabel } from "@/lib/academics/levels";
import { DEFAULT_EXAM_RULES, type ExamContext, type ExamIssue, type ExamSlot } from "./rules";
import type { DayOfWeek } from "@/lib/scheduler/types";

type Availability = { dayOfWeek: DayOfWeek; startMin: number; endMin: number };

export interface AutoScheduleClass {
  sectionId: string;
  sectionName: string;
  sectionLevel: string;
  yearLevel: string | null;
  gradeLevel: string | null;
  studentCount: number;
  subjectId: string;
  subjectCode: string;
  proctorId: string;
  proctorName: string;
  proctorDayOff: DayOfWeek | null;
  proctorAvailability: Availability[];
  roomId: string;
  startMin: number;
  endMin: number;
}

export interface AutoScheduleRoom {
  id: string;
  roomName: string;
  capacity: number;
  availability: Availability[];
}

export interface AutoScheduleUnavailability {
  facultyId: string | null;
  roomId: string | null;
  start: string;
  end: string;
  startMin: number | null;
  endMin: number | null;
}

export interface AutoScheduleExisting extends ExamSlot {
  subjectId?: string;
}

export interface AutoScheduleProposal extends ExamSlot {
  subjectId: string;
  roomName: string;
  sectionName: string;
  subjectCode: string;
  proctorName: string;
  yearGroup: string;
  warnings: ExamIssue[];
}

export interface UnscheduledClass {
  sectionName: string;
  subjectCode: string;
  yearGroup: string;
  reason: string;
}

export interface AutoScheduleResult {
  proposals: AutoScheduleProposal[];
  unscheduled: UnscheduledClass[];
}

const DAY_START = 7 * 60;
const DAY_END = 19 * 60;
const SLOT_MINUTES = 30;
const WEEKDAYS = new Set([1, 2, 3, 4, 5, 6]);
const DAY_NAMES: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const classKey = (item: Pick<AutoScheduleClass, "sectionId" | "subjectId">) => `${item.sectionId}|${item.subjectId}`;
const dateDay = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const addDay = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
const overlaps = (a: ExamSlot, b: ExamSlot) => a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin;
const gap = (a: ExamSlot, b: ExamSlot) => Math.max(a.startMin - b.endMin, b.startMin - a.endMin);

function issuesForCandidate(candidate: ExamSlot, sameDay: ExamSlot[], busy: ExamSlot[], context: ExamContext): ExamIssue[] {
  const rules = context.rules ?? DEFAULT_EXAM_RULES;
  const issues: ExamIssue[] = [];
  const push = (code: ExamIssue["code"], severity: ExamIssue["severity"], message: string, otherId?: string) =>
    issues.push({ examId: candidate.id, code, severity, message, otherId });
  if (context.window && (candidate.date < context.window.start || candidate.date > context.window.end)) {
    push("OUTSIDE_WINDOW", "conflict", "This date is outside the official examination window.");
  }
  const blocked = context.blockedDates.get(candidate.date);
  if (blocked) push("BLOCKED_DATE", "conflict", `${blocked} falls on this date.`);
  const seats = context.roomCapacity.get(candidate.roomId);
  const size = context.sectionSize.get(candidate.sectionId);
  if (seats !== undefined && size !== undefined && seats < size) {
    push("CAPACITY", "conflict", `The room seats ${seats} but the section has ${size} students.`);
  }
  if (candidate.startMin < rules.lunchEndMin && rules.lunchStartMin < candidate.endMin) {
    push("LUNCH", "warning", "This examination overlaps the lunch break.");
  }

  const perDay = sameDay.filter((exam) => exam.sectionId === candidate.sectionId).length + 1;
  if (perDay > rules.maxPerSectionPerDay) {
    push("MAX_PER_DAY", "warning", `The section has ${perDay} examinations this day (maximum ${rules.maxPerSectionPerDay}).`);
  }
  for (const other of [...sameDay, ...busy]) {
    const known = sameDay.includes(other);
    if (overlaps(candidate, other)) {
      if (candidate.roomId === other.roomId) push("ROOM_CONFLICT", "conflict", known ? "The room is double-booked." : "The room is busy at this time.", other.id);
      if (candidate.proctorId === other.proctorId) push("PROCTOR_CONFLICT", "conflict", "The proctor is double-booked.", other.id);
      if (candidate.sectionId === other.sectionId) push("SECTION_CONFLICT", "conflict", "The section has another scheduled activity at this time.", other.id);
    } else if (known && gap(candidate, other) < rules.bufferMin && (candidate.sectionId === other.sectionId || candidate.proctorId === other.proctorId)) {
      push("BUFFER", "warning", `Less than ${rules.bufferMin} minutes between examinations.`, other.id);
    }
  }
  return issues;
}

function hasConflict(issues: ExamIssue[]) {
  return issues.some((issue) => issue.severity === "conflict");
}

function fitsAvailability(availability: Availability[], day: DayOfWeek, startMin: number, endMin: number) {
  return availability.length === 0 || availability.some((window) =>
    window.dayOfWeek === day && window.startMin <= startMin && window.endMin >= endMin
  );
}

type Stage = Pick<AutoScheduleClass, "sectionLevel" | "yearLevel" | "gradeLevel">;

/** Sort position of a year or grade level inside its academic level. */
export function stageIndex(item: Stage) {
  const stage = item.yearLevel ?? item.gradeLevel;
  const stages = item.yearLevel ? YEAR_LEVELS : GRADE_LEVELS;
  const index = stage ? stages.findIndex((value) => value === stage) : -1;
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/** Group label such as "College · First Year". */
export function yearGroup(item: Stage) {
  const stage = item.yearLevel ? yearLabel(item.yearLevel) : item.gradeLevel ? gradeLabel(item.gradeLevel) : "Year or grade level not set";
  return `${levelLabel(item.sectionLevel)} · ${stage}`;
}

function compareClasses(a: AutoScheduleClass, b: AutoScheduleClass) {
  return ACADEMIC_LEVELS.indexOf(a.sectionLevel as (typeof ACADEMIC_LEVELS)[number]) -
    ACADEMIC_LEVELS.indexOf(b.sectionLevel as (typeof ACADEMIC_LEVELS)[number]) ||
    stageIndex(a) - stageIndex(b) ||
    a.sectionName.localeCompare(b.sectionName) ||
    a.subjectCode.localeCompare(b.subjectCode);
}

export function generateExaminationSchedule(
  classes: AutoScheduleClass[],
  existing: AutoScheduleExisting[],
  rooms: AutoScheduleRoom[],
  context: ExamContext,
  scheduledClasses: ExamSlot[] = [],
  unavailable: AutoScheduleUnavailability[] = [],
): AutoScheduleResult {
  const proposals: AutoScheduleProposal[] = [];
  const unscheduled: UnscheduledClass[] = [];
  const alreadyPlaced = new Set(existing.filter((exam) => exam.subjectId).map((exam) => `${exam.sectionId}|${exam.subjectId}`));
  const placedClasses = new Set<string>();
  const examsByDate = new Map<string, ExamSlot[]>();
  for (const exam of existing) examsByDate.set(exam.date, [...(examsByDate.get(exam.date) ?? []), exam]);
  const busyByDate = new Map<string, ExamSlot[]>();
  for (const exam of [...(context.busy ?? []), ...scheduledClasses]) {
    busyByDate.set(exam.date, [...(busyByDate.get(exam.date) ?? []), exam]);
  }

  for (const item of [...classes].sort(compareClasses)) {
    const key = classKey(item);
    if (alreadyPlaced.has(key) || placedClasses.has(key)) continue;
    placedClasses.add(key);

    const label = { sectionName: item.sectionName, subjectCode: item.subjectCode, yearGroup: yearGroup(item) };
    if (!context.window) {
      unscheduled.push({ ...label, reason: "There is no approved examination window for this period." });
      continue;
    }

    const duration = item.endMin - item.startMin;
    const suitableRooms = rooms
      .filter((room) => room.capacity >= item.studentCount)
      .sort((a, b) => Number(b.id === item.roomId) - Number(a.id === item.roomId) || a.capacity - b.capacity || a.roomName.localeCompare(b.roomName));
    if (!item.proctorId || !item.proctorName) {
      unscheduled.push({ ...label, reason: "The scheduled class teacher is inactive or unavailable to serve as a proctor." });
      continue;
    }
    if (duration <= 0 || duration > DAY_END - DAY_START) {
      unscheduled.push({ ...label, reason: "The class duration does not fit within the examination day." });
      continue;
    }
    if (!suitableRooms.length) {
      unscheduled.push({ ...label, reason: `No available department room can seat all ${item.studentCount} students.` });
      continue;
    }

    let best: { proposal: AutoScheduleProposal; score: number } | null = null;
    for (let date = context.window.start; date <= context.window.end; date = addDay(date)) {
      if (!WEEKDAYS.has(dateDay(date))) continue;
      for (let startMin = DAY_START; startMin + duration <= DAY_END; startMin += SLOT_MINUTES) {
        for (const room of suitableRooms) {
          const day = DAY_NAMES[dateDay(date)];
          if (item.proctorDayOff === day || !fitsAvailability(item.proctorAvailability, day, startMin, startMin + duration)) continue;
          if (!fitsAvailability(room.availability, day, startMin, startMin + duration)) continue;
          if (unavailable.some((entry) =>
            (entry.facultyId === item.proctorId || entry.roomId === room.id) &&
            date >= entry.start && date <= entry.end &&
            (entry.startMin === null || entry.endMin === null || (startMin < entry.endMin && entry.startMin < startMin + duration))
          )) continue;
          const sameDay = examsByDate.get(date) ?? [];
          const candidate: AutoScheduleProposal = {
            id: `auto-${item.sectionId}-${item.subjectId}`,
            sectionId: item.sectionId,
            subjectId: item.subjectId,
            roomId: room.id,
            proctorId: item.proctorId,
            roomName: room.roomName,
            sectionName: item.sectionName,
            subjectCode: item.subjectCode,
            proctorName: item.proctorName,
            yearGroup: label.yearGroup,
            date,
            startMin,
            endMin: startMin + duration,
            warnings: [],
          };
          const issues = issuesForCandidate(candidate, sameDay, busyByDate.get(date) ?? [], context);
          if (hasConflict(issues)) continue;

          const score = issues.length * 100_000 +
            sameDay.length * 1_000 +
            Number(room.id !== item.roomId) * 100 +
            Math.abs(startMin - item.startMin) +
            (room.capacity - item.studentCount);
          const proposal = { ...candidate, warnings: issues };
          if (!best || score < best.score) best = { proposal, score };
        }
      }
    }

    if (best) {
      proposals.push(best.proposal);
      examsByDate.set(best.proposal.date, [...(examsByDate.get(best.proposal.date) ?? []), best.proposal]);
    }
    else unscheduled.push({ ...label, reason: "No conflict-free date, time, proctor, and suitable room were found in the approved window." });
  }

  return { proposals, unscheduled };
}
