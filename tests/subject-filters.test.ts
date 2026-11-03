import { describe, expect, it } from "vitest";
import { filterSubjects, parseSubjectFilters } from "@/lib/subjects/filters";

const rows = [
  { id: "major-first-own", category: "MAJOR" as const, semester: "FIRST" as const, departmentId: "ccs", sharedProgramIds: ["bsit"] },
  { id: "minor-first-other", category: "MINOR" as const, semester: "FIRST" as const, departmentId: "gened", sharedProgramIds: ["bsit", "bscs"] },
  { id: "major-second-own", category: "MAJOR" as const, semester: "SECOND" as const, departmentId: "ccs", sharedProgramIds: ["bsit", "bscs"] },
  { id: "major-midyear-own", category: "MAJOR" as const, semester: "SUMMER" as const, departmentId: "ccs", sharedProgramIds: ["bsit"] },
];

describe("subject filters", () => {
  it("combines category, semester, and ownership", () => expect(filterSubjects(rows, { category: "MAJOR", semester: "1", owner: "ME" }, "ccs").map((r) => r.id)).toEqual(["major-first-own"]));
  it("finds joined subjects in the selected semester", () => expect(filterSubjects(rows, { category: "JOINED", semester: "2", owner: "ALL" }, "ccs").map((r) => r.id)).toEqual(["major-second-own"]));
  it("maps Midyear and ownership together", () => expect(filterSubjects(rows, { category: "ALL", semester: "MIDYEAR", owner: "ME" }, "ccs").map((r) => r.id)).toEqual(["major-midyear-own"]));
  it("falls back for invalid query values", () => expect(parseSubjectFilters({ category: "BAD", semester: "3", owner: "THEM" }, true)).toMatchObject({ category: "ALL", semester: null, owner: "ALL" }));
});
