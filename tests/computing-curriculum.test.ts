import { describe, expect, it } from "vitest";
import { COMPUTING_CURRICULA, computingSubjects } from "@/prisma/computing-curriculum";
import { subjectAppliesToSection } from "@/lib/scheduler/timetable";

describe("supplied First Semester 2026-2027 computing curricula", () => {
  it.each([
    ["BSCS", [8, 7, 8, 2], [23, 20, 24, 9], [1, 1, 1, 1]],
    ["BSIT", [8, 8, 6, 2], [23, 23, 18, 9], [8, 6, 4, 3]],
  ] as const)("matches %s subject counts, unit totals, and section ranges from the image", (code, counts, units, sections) => {
    const curriculum = COMPUTING_CURRICULA.find((program) => program.code === code)!;
    expect(curriculum.years.map((year) => year.subjects.length)).toEqual(counts);
    expect(curriculum.years.map((year) => year.subjects.reduce((sum, row) => sum + row[2], 0))).toEqual(units);
    expect(curriculum.years.map((year) => year.sections)).toEqual(sections);
  });

  it("shares identical codes once and retains the distinct service and practicum courses", () => {
    const subjects = computingSubjects();
    expect(subjects).toHaveLength(38);
    expect(subjects.find((subject) => subject.code === "CC101")?.programs).toEqual(["BSCS", "BSIT"]);
    expect(subjects.find((subject) => subject.code === "CWTS1")?.programs).toEqual(["BSCS"]);
    expect(subjects.find((subject) => subject.code === "NSTP1")?.programs).toEqual(["BSIT"]);
    expect(subjects.find((subject) => subject.code === "CSC401")).toMatchObject({ units: 6, name: "Practicum (300 hours)" });
    expect(subjects.find((subject) => subject.code === "ITC22")).toMatchObject({ units: 6, name: "Practicum (500 HRS)" });
  });

  it("limits explicitly shared subjects to their programs and year", () => {
    const subject = { level: "COLLEGE", programId: null, sharedProgramIds: ["bsit", "bscs"], yearLevel: "FIRST", gradeLevel: null };
    const section = { level: "COLLEGE", programId: "bscs", yearLevel: "FIRST", gradeLevel: null };
    expect(subjectAppliesToSection(subject, section)).toBe(true);
    expect(subjectAppliesToSection(subject, { ...section, programId: "bsa" })).toBe(false);
    expect(subjectAppliesToSection(subject, { ...section, yearLevel: "SECOND" })).toBe(false);
    expect(subjectAppliesToSection({ ...subject, programId: "bsit" }, section)).toBe(true);
    expect(subjectAppliesToSection({ ...subject, sharedProgramIds: [] }, { ...section, programId: "bsa" })).toBe(true);
  });
});
