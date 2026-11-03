/** Pure examination constraint checks; shared by the Scheduler page and the server so both agree. */

export interface ExamSlot {
  id: string;
  date: string; // YYYY-MM-DD
  startMin: number;
  endMin: number;
  sectionId: string;
  roomId: string;
  proctorId: string;
}

export interface ExamRules {
  /** Minimum gap between examinations of the same section or proctor. */
  bufferMin: number;
  maxPerSectionPerDay: number;
  lunchStartMin: number;
  lunchEndMin: number;
}

export const DEFAULT_EXAM_RULES: ExamRules = { bufferMin: 30, maxPerSectionPerDay: 3, lunchStartMin: 12 * 60, lunchEndMin: 13 * 60 };

export interface ExamContext {
  /** Official window of the chosen period; null when no approved window exists. */
  window: { start: string; end: string } | null;
  /** Holidays, class suspensions, and other approved all-day activities, by date. */
  blockedDates: ReadonlyMap<string, string>;
  roomCapacity: ReadonlyMap<string, number>;
  sectionSize: ReadonlyMap<string, number>;
  /** Examinations of other departments or programs: only their room and time matter, never what they are. */
  busy?: readonly ExamSlot[];
  rules?: ExamRules;
}

export type ExamIssueCode =
  | "ROOM_CONFLICT" | "PROCTOR_CONFLICT" | "SECTION_CONFLICT" | "OUTSIDE_WINDOW" | "BLOCKED_DATE" | "CAPACITY"
  | "BUFFER" | "MAX_PER_DAY" | "LUNCH";

export interface ExamIssue {
  examId: string;
  code: ExamIssueCode;
  /** Hard issues block saving for approval; soft ones are warnings. */
  severity: "conflict" | "warning";
  message: string;
  otherId?: string;
}

const overlaps = (a: ExamSlot, b: ExamSlot) => a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin;
const gap = (a: ExamSlot, b: ExamSlot) => (a.date === b.date ? Math.max(a.startMin - b.endMin, b.startMin - a.endMin) : Infinity);

/** All hard conflicts and soft warnings for a set of examinations. */
export function checkExaminations(slots: readonly ExamSlot[], ctx: ExamContext): ExamIssue[] {
  const rules = ctx.rules ?? DEFAULT_EXAM_RULES;
  const out: ExamIssue[] = [];
  const push = (examId: string, code: ExamIssueCode, severity: ExamIssue["severity"], message: string, otherId?: string) => out.push({ examId, code, severity, message, otherId });

  for (const a of slots) {
    if (ctx.window && (a.date < ctx.window.start || a.date > ctx.window.end)) push(a.id, "OUTSIDE_WINDOW", "conflict", "This date is outside the official examination window.");
    const blocked = ctx.blockedDates.get(a.date);
    if (blocked) push(a.id, "BLOCKED_DATE", "conflict", `${blocked} falls on this date.`);
    const seats = ctx.roomCapacity.get(a.roomId);
    const size = ctx.sectionSize.get(a.sectionId);
    if (seats !== undefined && size !== undefined && seats < size) push(a.id, "CAPACITY", "conflict", `The room seats ${seats} but the section has ${size} students.`);
    if (a.startMin < rules.lunchEndMin && rules.lunchStartMin < a.endMin) push(a.id, "LUNCH", "warning", "This examination overlaps the lunch break.");

    const perDay = slots.filter((b) => b.sectionId === a.sectionId && b.date === a.date).length;
    if (perDay > rules.maxPerSectionPerDay) push(a.id, "MAX_PER_DAY", "warning", `The section has ${perDay} examinations this day (maximum ${rules.maxPerSectionPerDay}).`);

    for (const b of [...slots, ...(ctx.busy ?? [])]) {
      if (b.id === a.id) continue;
      const known = slots.includes(b);
      if (overlaps(a, b)) {
        if (a.roomId === b.roomId) push(a.id, "ROOM_CONFLICT", "conflict", known ? "The room is double-booked." : "The room is busy at this time.", b.id);
        if (a.proctorId === b.proctorId) push(a.id, "PROCTOR_CONFLICT", "conflict", "The proctor is double-booked.", b.id);
        if (known && a.sectionId === b.sectionId) push(a.id, "SECTION_CONFLICT", "conflict", "The section has two examinations at this time.", b.id);
      } else if (known && gap(a, b) < rules.bufferMin && (a.sectionId === b.sectionId || a.proctorId === b.proctorId)) {
        push(a.id, "BUFFER", "warning", `Less than ${rules.bufferMin} minutes between examinations.`, b.id);
      }
    }
  }
  return out;
}

export const hasHardConflict = (issues: readonly ExamIssue[]) => issues.some((i) => i.severity === "conflict");
