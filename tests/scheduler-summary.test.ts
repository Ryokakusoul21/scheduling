import { describe, expect, it } from "vitest";
import { allSectionNeeds, facultyNotAssigned, sectionNeeds } from "@/lib/scheduler/summary";
import type { SchedEntry } from "@/lib/scheduler/types";

const section = { id: "s1", level: "COLLEGE", programId: "p1", yearLevel: "FIRST", gradeLevel: null };
const subject = { id: "it101", level: "COLLEGE", programId: "p1", yearLevel: "FIRST", gradeLevel: null, lectureHours: 2, labHours: 3 };
const entry = (over: Partial<SchedEntry & { status: string }> = {}) => ({
  id: "e1", semesterId: "t1", sectionId: "s1", subjectId: "it101", facultyId: "f1", roomId: "r1",
  component: "LECTURE" as const, dayOfWeek: "MONDAY" as const, startMin: 480, endMin: 600, status: "DRAFT", ...over,
});

describe("facultyNotAssigned", () => {
  it("flags empty and inactive faculty but not active or outside faculty", () => {
    const found = facultyNotAssigned(
      [entry({ id: "a", facultyId: "" }), entry({ id: "b", facultyId: "gone" }), entry({ id: "c" }), entry({ id: "d", facultyId: "ge" })],
      new Set(["f1", "ge"])
    );
    expect(found.map((c) => c.entryA.id)).toEqual(["a", "b"]);
    expect(found.every((c) => c.type === "FACULTY_NOT_ASSIGNED")).toBe(true);
  });

  it("ignores archived classes", () => {
    expect(facultyNotAssigned([entry({ facultyId: "", status: "ARCHIVED" })], new Set())).toEqual([]);
  });
});

describe("sectionNeeds", () => {
  it("counts only the section's own term", () => {
    const needs = sectionNeeds(section, [subject], [entry(), entry({ id: "x", semesterId: "t2", component: "LABORATORY", endMin: 660 })], "t1");
    expect(needs.map((n) => n.component)).toEqual(["LABORATORY"]);
  });

  it("totals across sections", () => {
    const other = { ...section, id: "s2" };
    expect(allSectionNeeds([section, other], [subject], [entry()], () => "t1")).toHaveLength(3);
  });
});
