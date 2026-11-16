import { describe, expect, it } from "vitest";
import { filterSubjectSemester, selectedSubjectSemester, subjectSemesterError, subjectSemesterOptions, subjectTerms, type SubjectCalendar } from "@/lib/subjects/terms";
import { filterSubjects } from "@/lib/subjects/filters";

export const calendar: SubjectCalendar = { id: "ay", name: "2026-2027", isActive: true, semesters: [
  { id: "second", name: "Second Semester", type: "SECOND", programId: null, isActive: false },
  { id: "first", name: "First Semester", type: "FIRST", programId: null, isActive: true },
  { id: "course-second", name: "BSCS Second Semester", type: "SECOND", programId: "bscs", isActive: true },
] };

describe("subject semester calendars", () => {
  it("uses configured names and order without inventing Summer", () => {
    expect(subjectSemesterOptions(calendar, "bsit")).toEqual([{ value: "FIRST", label: "First Semester" }, { value: "SECOND", label: "Second Semester" }]);
  });
  it("uses a course's own calendar instead of shared terms", () => {
    expect(subjectTerms(calendar, "bscs").map((t) => t.id)).toEqual(["course-second"]);
    expect(subjectSemesterError(calendar, "bscs", "FIRST")).toContain("Choose a semester configured");
  });
  it("blocks absent calendars and unconfigured terms, including stale academic years", () => {
    expect(subjectSemesterError(null, "bsit", "FIRST")).toContain("Set up");
    expect(subjectSemesterError({ ...calendar, semesters: [] }, null, null)).toContain("Set up");
    expect(subjectSemesterError(calendar, null, "SUMMER")).toContain("Choose a semester configured");
  });
  it("allows any configured semester and immediately reflects a newly created Summer", () => {
    expect(subjectSemesterError(calendar, null, null)).toBeNull();
    expect(subjectSemesterError({ ...calendar, semesters: [...calendar.semesters, { id: "summer", name: "Summer", type: "SUMMER", programId: null, isActive: false }] }, null, "SUMMER")).toBeNull();
  });
  it("includes subjects offered in any semester when a configured term is selected", () => {
    const row = { category: "MAJOR" as const, semester: null, departmentId: "coics", sharedProgramIds: [] };
    expect(filterSubjects([row], { semester: "1", category: "ALL", owner: "ALL" }, null)).toEqual([row]);
  });
  it("accepts configured filters and falls back to All for absent or unconfigured choices", () => {
    const options = subjectSemesterOptions(calendar, "bsit");
    expect(selectedSubjectSemester(options, "SECOND")).toBe("SECOND");
    expect(selectedSubjectSemester(options, "1")).toBe("FIRST");
    expect(selectedSubjectSemester(options, "SUMMER")).toBe("ALL");
    expect(selectedSubjectSemester(options)).toBe("ALL");
  });
  it("filters college subjects including any-semester rows and leaves basic education unchanged", () => {
    const rows = [
      { level: "COLLEGE", semester: "FIRST" }, { level: "COLLEGE", semester: "SECOND" },
      { level: "COLLEGE", semester: null }, { level: "ELEMENTARY", semester: null },
    ];
    expect(filterSubjectSemester(rows, "FIRST")).toEqual([rows[0], rows[2], rows[3]]);
    expect(filterSubjectSemester(rows, "ALL")).toEqual(rows);
  });
});
