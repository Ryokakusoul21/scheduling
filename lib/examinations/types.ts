/** Examination periods and their labels (browser-safe). */
export const EXAM_TYPES = ["PRELIMINARY", "MIDTERM", "SEMI_FINAL", "FINAL", "SPECIAL"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  PRELIMINARY: "Preliminary",
  MIDTERM: "Midterm",
  SEMI_FINAL: "Semi-Finals",
  FINAL: "Final",
  SPECIAL: "Special",
};

/** Periods the auto-scheduler plans for. */
export const EXAM_PERIODS = ["PRELIMINARY", "MIDTERM", "SEMI_FINAL", "FINAL"] as const satisfies readonly ExamType[];
