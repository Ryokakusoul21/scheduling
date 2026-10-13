/**
 * Academic structure shared by server and client code: levels, grade/year
 * levels, and which kind of term (semester vs. quarter) each level uses.
 * Kept free of Prisma imports so it can run in the browser.
 */

export const ACADEMIC_LEVELS = ["COLLEGE", "SENIOR_HIGH", "JUNIOR_HIGH", "ELEMENTARY"] as const;
export type AcademicLevel = (typeof ACADEMIC_LEVELS)[number];

export const GRADE_LEVELS = [
  "KINDER",
  "GRADE_1",
  "GRADE_2",
  "GRADE_3",
  "GRADE_4",
  "GRADE_5",
  "GRADE_6",
  "GRADE_7",
  "GRADE_8",
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
  "GRADE_12",
] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

export const YEAR_LEVELS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"] as const;
export type YearLevel = (typeof YEAR_LEVELS)[number];

export const SEMESTER_TYPES = ["FIRST", "SECOND", "SUMMER"] as const;
export const QUARTER_TYPES = ["QUARTER_1", "QUARTER_2", "QUARTER_3", "QUARTER_4"] as const;
export type TermType = (typeof SEMESTER_TYPES)[number] | (typeof QUARTER_TYPES)[number];

export interface LevelInfo {
  value: AcademicLevel;
  label: string;
  short: string;
  description: string;
  /** Grade levels that belong to this level (empty for College, which uses year levels). */
  grades: readonly GradeLevel[];
  /** Whether sections/subjects are organised by program (course or strand). */
  usesPrograms: boolean;
  termKind: "semester" | "quarter";
}

export const LEVELS: Record<AcademicLevel, LevelInfo> = {
  COLLEGE: {
    value: "COLLEGE",
    label: "College",
    short: "College",
    description: "Degree programs organised by department, course, and year level",
    grades: [],
    usesPrograms: true,
    termKind: "semester",
  },
  SENIOR_HIGH: {
    value: "SENIOR_HIGH",
    label: "Senior High School",
    short: "Senior High",
    description: "Grades 11–12 with academic and technical-vocational strands",
    grades: ["GRADE_11", "GRADE_12"],
    usesPrograms: true,
    termKind: "quarter",
  },
  JUNIOR_HIGH: {
    value: "JUNIOR_HIGH",
    label: "Junior High School",
    short: "Junior High",
    description: "Grades 7–10",
    grades: ["GRADE_7", "GRADE_8", "GRADE_9", "GRADE_10"],
    usesPrograms: false,
    termKind: "quarter",
  },
  ELEMENTARY: {
    value: "ELEMENTARY",
    label: "Elementary",
    short: "Elementary",
    description: "Kindergarten to Grade 6",
    grades: ["KINDER", "GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6"],
    usesPrograms: false,
    termKind: "quarter",
  },
};

export function levelLabel(level: string) {
  return LEVELS[level as AcademicLevel]?.label ?? level;
}

export function isAcademicLevel(v: unknown): v is AcademicLevel {
  return typeof v === "string" && (ACADEMIC_LEVELS as readonly string[]).includes(v);
}

export function isGradeLevel(v: unknown): v is GradeLevel {
  return typeof v === "string" && (GRADE_LEVELS as readonly string[]).includes(v);
}

export function isYearLevel(v: unknown): v is YearLevel {
  return typeof v === "string" && (YEAR_LEVELS as readonly string[]).includes(v);
}

export function gradeLabel(grade: string) {
  if (grade === "KINDER") return "Kindergarten";
  const n = grade.replace("GRADE_", "");
  return `Grade ${n}`;
}

const ORDINAL: Record<YearLevel, string> = {
  FIRST: "First Year",
  SECOND: "Second Year",
  THIRD: "Third Year",
  FOURTH: "Fourth Year",
  FIFTH: "Fifth Year",
};

export function yearLabel(year: string) {
  return ORDINAL[year as YearLevel] ?? year;
}

/** Which level a grade belongs to. */
export function levelForGrade(grade: GradeLevel): AcademicLevel {
  return (Object.values(LEVELS).find((l) => l.grades.includes(grade))?.value ?? "ELEMENTARY") as AcademicLevel;
}

const TERM_LABELS: Record<TermType, string> = {
  FIRST: "First Semester",
  SECOND: "Second Semester",
  SUMMER: "Summer",
  QUARTER_1: "First Quarter",
  QUARTER_2: "Second Quarter",
  QUARTER_3: "Third Quarter",
  QUARTER_4: "Fourth Quarter",
};

export function termLabel(type: string) {
  return TERM_LABELS[type as TermType] ?? type;
}

export function termTypesFor(level: AcademicLevel): readonly TermType[] {
  return LEVELS[level].termKind === "semester" ? SEMESTER_TYPES : QUARTER_TYPES;
}

/** "Grade 11", "Second Year", etc. for a section/subject row. */
export function stageLabel(row: { level: string; yearLevel?: string | null; gradeLevel?: string | null }) {
  if (row.level === "COLLEGE") return row.yearLevel ? yearLabel(row.yearLevel) : "Any year";
  return row.gradeLevel ? gradeLabel(row.gradeLevel) : "Any grade";
}

/** College programs and SHS strands offered by the school (used by the seed and as hints in forms). */
export const DEFAULT_COLLEGE_PROGRAMS = [
  { code: "BSIT", name: "Bachelor of Science in Information Technology", department: "CCS" },
  { code: "BSCS", name: "Bachelor of Science in Computer Science", department: "CCS" },
  { code: "BSCrim", name: "Bachelor of Science in Criminology", department: "CCJE" },
  { code: "BSISM", name: "Bachelor of Science in Industrial Security Management", department: "CCJE" },
  { code: "BSA", name: "Bachelor of Science in Accountancy", department: "CBA" },
  { code: "BSBA", name: "Bachelor of Science in Business Administration", department: "CBA" },
  { code: "BSTM", name: "Bachelor of Science in Tourism Management", department: "CHTM" },
  { code: "BEED", name: "Bachelor of Elementary Education", department: "CTE" },
  { code: "BSED", name: "Bachelor of Secondary Education", department: "CTE" },
] as const;

export const DEFAULT_SHS_STRANDS = [
  { code: "ABM", name: "Accountancy, Business and Management" },
  { code: "HUMSS", name: "Humanities and Social Sciences" },
  { code: "GAS", name: "General Academic Strand" },
  { code: "STEM", name: "Science, Technology, Engineering and Mathematics" },
  { code: "ICT", name: "Information and Communications Technology" },
  { code: "TVL", name: "Technical-Vocational-Livelihood" },
  { code: "IA", name: "Industrial Arts" },
] as const;
