/**
 * Column definitions and row validation for bulk subject and room imports.
 * Pure and browser-safe: the preview and the server both run the same checks (tests/import.test.ts).
 */
import { GRADE_LEVELS, levelForGrade, type AcademicLevel, type GradeLevel, type YearLevel } from "@/lib/academics/levels";
import type { RoomType } from "@/lib/scheduler/types";

export type ImportKind = "subjects" | "rooms";

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  example: string;
  help: string;
}

export const SUBJECT_COLUMNS: ImportColumn[] = [
  { key: "code", header: "Code", required: true, example: "IT204", help: "Unique subject code" },
  { key: "name", header: "Name", required: true, example: "Object-Oriented Programming", help: "Full subject title" },
  { key: "units", header: "Units", required: true, example: "3", help: "Number of units" },
  { key: "lectureHours", header: "Lecture Hours", required: true, example: "2", help: "Weekly lecture hours" },
  { key: "labHours", header: "Laboratory Hours", required: true, example: "1", help: "Weekly laboratory hours (0 if none)" },
  { key: "roomType", header: "Required Room Type", required: true, example: "Computer laboratory", help: "Lecture room, Computer laboratory, Science laboratory, Conference room, or Other" },
  { key: "level", header: "Academic Level", required: true, example: "College", help: "College, Senior High School, Junior High School, or Elementary" },
  { key: "program", header: "Program Code", example: "BSIT", help: "College course or Senior High School strand code; blank for general subjects" },
  { key: "yearLevel", header: "Year Level", example: "Second", help: "College only: First to Fifth" },
  { key: "gradeLevel", header: "Grade Level", example: "", help: "Basic education only: Kindergarten or Grade 1 to Grade 12" },
  { key: "description", header: "Description", example: "", help: "Optional" },
];

export const ROOM_COLUMNS: ImportColumn[] = [
  { key: "roomNumber", header: "Room Number", required: true, example: "1204", help: "Unique room number" },
  { key: "roomName", header: "Room Name", required: true, example: "Computer Laboratory 5", help: "Display name" },
  { key: "building", header: "Building", required: true, example: "Information Technology Building", help: "Created if it does not exist" },
  { key: "floor", header: "Floor", required: true, example: "Second Floor", help: "Created if it does not exist" },
  { key: "capacity", header: "Capacity", required: true, example: "40", help: "Number of seats" },
  { key: "roomType", header: "Room Type", required: true, example: "Computer laboratory", help: "Lecture room, Computer laboratory, Science laboratory, Conference room, or Other" },
  { key: "equipment", header: "Equipment", example: "40 computers; Projector", help: "Separate items with semicolons" },
  { key: "department", header: "Department", example: "College of Computer Studies", help: "Owning department name or code; blank for a shared room" },
];

export const COLUMNS: Record<ImportKind, ImportColumn[]> = { subjects: SUBJECT_COLUMNS, rooms: ROOM_COLUMNS };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function pick<T extends string>(value: string, options: Record<string, T>): T | null {
  return options[norm(value)] ?? null;
}

const ROOM_TYPES: Record<string, RoomType> = {
  lectureroom: "LECTURE_ROOM", lecture: "LECTURE_ROOM", classroom: "LECTURE_ROOM",
  computerlaboratory: "COMPUTER_LABORATORY", sciencelaboratory: "SCIENCE_LABORATORY",
  conferenceroom: "CONFERENCE_ROOM", other: "OTHER",
};
const LEVELS: Record<string, AcademicLevel> = {
  college: "COLLEGE", seniorhighschool: "SENIOR_HIGH", seniorhigh: "SENIOR_HIGH",
  juniorhighschool: "JUNIOR_HIGH", juniorhigh: "JUNIOR_HIGH", elementary: "ELEMENTARY",
};
const YEARS: Record<string, YearLevel> = {
  first: "FIRST", "1": "FIRST", firstyear: "FIRST", second: "SECOND", "2": "SECOND", secondyear: "SECOND",
  third: "THIRD", "3": "THIRD", thirdyear: "THIRD", fourth: "FOURTH", "4": "FOURTH", fourthyear: "FOURTH",
  fifth: "FIFTH", "5": "FIFTH", fifthyear: "FIFTH",
};
const GRADES: Record<string, GradeLevel> = Object.fromEntries([
  ["kinder", "KINDER"], ["kindergarten", "KINDER"],
  ...GRADE_LEVELS.filter((g) => g !== "KINDER").flatMap((g) => {
    const n = g.replace("GRADE_", "");
    return [[`grade${n}`, g], [n, g]];
  }),
]);

export interface RowResult<T> {
  row: number;
  data: T | null;
  errors: string[];
  warnings: string[];
}

export interface SubjectRow {
  code: string;
  name: string;
  units: number;
  lectureHours: number;
  labHours: number;
  requiredRoomType: RoomType;
  level: AcademicLevel;
  programCode: string | null;
  yearLevel: YearLevel | null;
  gradeLevel: GradeLevel | null;
  description: string | null;
}

export interface SubjectLookups {
  programs: { code: string; level: string }[];
  existingCodes: string[];
}

function num(value: string, label: string, errors: string[], min: number, max: number) {
  const n = Number(value);
  if (value === "" || Number.isNaN(n)) errors.push(`${label} must be a number.`);
  else if (n < min || n > max) errors.push(`${label} must be between ${min} and ${max}.`);
  return n;
}

export function validateSubjects(records: Record<string, string>[], lookups: SubjectLookups): RowResult<SubjectRow>[] {
  const existing = new Set(lookups.existingCodes.map((c) => c.toUpperCase()));
  const seen = new Set<string>();
  return records.map((r, i) => {
    const errors: string[] = [];
    for (const c of SUBJECT_COLUMNS) if (c.required && !r[c.key]) errors.push(`${c.header} is required.`);
    const code = r.code.toUpperCase();
    if (code && existing.has(code)) errors.push(`Subject code ${code} already exists.`);
    if (code && seen.has(code)) errors.push(`Subject code ${code} appears more than once in this file.`);
    seen.add(code);
    const units = num(r.units, "Units", errors, 0.5, 10);
    const lectureHours = num(r.lectureHours, "Lecture Hours", errors, 0, 20);
    const labHours = num(r.labHours, "Laboratory Hours", errors, 0, 20);
    if (lectureHours + labHours === 0) errors.push("A subject needs lecture or laboratory hours.");
    const requiredRoomType = pick(r.roomType, ROOM_TYPES);
    if (r.roomType && !requiredRoomType) errors.push(`Unknown room type "${r.roomType}".`);
    const level = pick(r.level, LEVELS);
    if (r.level && !level) errors.push(`Unknown academic level "${r.level}".`);

    const program = r.program ? lookups.programs.find((p) => p.code.toUpperCase() === r.program.toUpperCase()) : null;
    if (r.program && !program) errors.push(`Program code ${r.program} does not exist.`);
    if (program && level && program.level !== level) errors.push(`Program ${program.code} belongs to a different academic level.`);
    if (program && level && level !== "COLLEGE" && level !== "SENIOR_HIGH") errors.push("Only College and Senior High School subjects can belong to a program.");

    const yearLevel = r.yearLevel ? pick(r.yearLevel, YEARS) : null;
    if (r.yearLevel && !yearLevel) errors.push(`Unknown year level "${r.yearLevel}".`);
    if (yearLevel && level && level !== "COLLEGE") errors.push("Year level applies to College subjects only.");
    const gradeLevel = r.gradeLevel ? pick(r.gradeLevel, GRADES) : null;
    if (r.gradeLevel && !gradeLevel) errors.push(`Unknown grade level "${r.gradeLevel}".`);
    if (gradeLevel && level && levelForGrade(gradeLevel) !== level) errors.push(`${r.gradeLevel} is not part of ${r.level}.`);
    if (level && level !== "COLLEGE" && !gradeLevel) errors.push("Basic education subjects need a grade level.");

    const warnings = requiredRoomType && labHours > 0 && !requiredRoomType.endsWith("LABORATORY") ? ["Has laboratory hours but does not require a laboratory room."] : [];
    const data: SubjectRow | null = errors.length
      ? null
      : { code, name: r.name, units, lectureHours, labHours, requiredRoomType: requiredRoomType!, level: level!, programCode: program?.code ?? null, yearLevel, gradeLevel, description: r.description || null };
    return { row: i + 2, data, errors, warnings };
  });
}

export interface RoomRow {
  roomNumber: string;
  roomName: string;
  building: string;
  floor: string;
  capacity: number;
  roomType: RoomType;
  equipment: string[];
  departmentId: string | null;
}

export interface RoomLookups {
  existingNumbers: string[];
  departments: { id: string; code: string; name: string }[];
  floors: { building: string; floor: string }[];
}

export function validateRooms(records: Record<string, string>[], lookups: RoomLookups): RowResult<RoomRow>[] {
  const existing = new Set(lookups.existingNumbers.map(norm));
  const seen = new Set<string>();
  const known = new Set(lookups.floors.map((f) => `${norm(f.building)}|${norm(f.floor)}`));
  return records.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const c of ROOM_COLUMNS) if (c.required && !r[c.key]) errors.push(`${c.header} is required.`);
    const key = norm(r.roomNumber);
    if (key && existing.has(key)) errors.push(`Room number ${r.roomNumber} already exists.`);
    if (key && seen.has(key)) errors.push(`Room number ${r.roomNumber} appears more than once in this file.`);
    seen.add(key);
    const capacity = num(r.capacity, "Capacity", errors, 1, 1000);
    if (!Number.isInteger(capacity)) errors.push("Capacity must be a whole number.");
    const roomType = pick(r.roomType, ROOM_TYPES);
    if (r.roomType && !roomType) errors.push(`Unknown room type "${r.roomType}".`);
    const department = r.department ? lookups.departments.find((d) => norm(d.code) === norm(r.department) || norm(d.name) === norm(r.department)) : null;
    if (r.department && !department) errors.push(`Department "${r.department}" does not exist.`);
    if (r.building && r.floor && !known.has(`${norm(r.building)}|${norm(r.floor)}`)) warnings.push(`${r.floor} of ${r.building} will be created.`);
    const data: RoomRow | null = errors.length
      ? null
      : {
          roomNumber: r.roomNumber, roomName: r.roomName, building: r.building, floor: r.floor, capacity, roomType: roomType!,
          equipment: r.equipment ? r.equipment.split(";").map((e) => e.trim()).filter(Boolean) : [], departmentId: department?.id ?? null,
        };
    return { row: i + 2, data, errors, warnings };
  });
}

/** Downloadable template: header row, one example row, and a row of instructions. */
export function templateCsv(kind: ImportKind) {
  const cols = COLUMNS[kind];
  const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [cols.map((c) => q(c.header)).join(","), cols.map((c) => q(c.example)).join(",")].join("\r\n");
}
