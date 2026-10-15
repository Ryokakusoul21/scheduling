import { describe, expect, it } from "vitest";
import { checkAll, checkEntry, type ConstraintContext, type ConstraintKind, type ConstraintRule } from "@/lib/scheduler/constraints";
import type { SchedEntry } from "@/lib/scheduler/types";

const ctx: ConstraintContext = {
  rooms: new Map([
    ["r1", { name: "Room 101", capacity: 40, isGeneralShared: true, programIds: [] }],
    ["stem", { name: "Physics Laboratory", capacity: 40, isGeneralShared: false, programIds: ["STEM"] }],
    ["small", { name: "Room 102", capacity: 20, isGeneralShared: true, programIds: [] }],
  ]),
  sections: new Map([
    ["secA", { name: "STEM 11-A", studentCount: 35, programId: "STEM", departmentId: "d1" }],
    ["secB", { name: "ABM 11-A", studentCount: 35, programId: "ABM", departmentId: "d2" }],
  ]),
  subjects: new Map([["math", { code: "MATH11", name: "General Mathematics" }]]),
  faculty: new Map([["f1", { name: "Ana Santos" }]]),
  programNames: new Map([["STEM", "Science, Technology, Engineering and Mathematics"]]),
};

function rule(kind: ConstraintKind, params: object = {}, departmentId: string | null = null): ConstraintRule {
  return { id: kind, kind, name: kind, params, departmentId };
}

function entry(id: string, patch: Partial<SchedEntry> = {}): SchedEntry {
  return { id, subjectId: "math", sectionId: "secA", facultyId: "f1", roomId: "r1", component: "LECTURE", dayOfWeek: "MONDAY", startMin: 480, endMin: 540, ...patch };
}

describe("hard constraints", () => {
  it("blocks a section in a room designated for another strand", () => {
    const v = checkEntry(entry("a", { sectionId: "secB", roomId: "stem" }), [], [rule("ROOM_DESIGNATION")], ctx);
    expect(v).toHaveLength(1);
    expect(v[0].hard).toBe(true);
    expect(v[0].message).toContain("Physics Laboratory");
  });

  it("allows designated and General / Shared rooms", () => {
    const rules = [rule("ROOM_DESIGNATION")];
    expect(checkEntry(entry("a", { roomId: "stem" }), [], rules, ctx)).toHaveLength(0);
    expect(checkEntry(entry("a", { sectionId: "secB" }), [], rules, ctx)).toHaveLength(0);
  });

  it("flags a room that is too small", () => {
    expect(checkEntry(entry("a", { roomId: "small" }), [], [rule("ROOM_CAPACITY")], ctx)[0].message).toContain("seats 20");
  });

  it("enforces daily and weekly teaching limits", () => {
    const others = [entry("b", { startMin: 540, endMin: 720 }), entry("c", { dayOfWeek: "TUESDAY", startMin: 480, endMin: 720 })];
    const v = checkEntry(entry("a"), others, [rule("MAX_TEACHING_LOAD", { maxDailyHours: 3, maxWeeklyHours: 6 })], ctx);
    expect(v.map((x) => x.message).join(" ")).toMatch(/4 hours on Monday.*8 hours a week/);
  });

  it("only applies a department rule to that department", () => {
    const r = [rule("ROOM_CAPACITY", {}, "d2")];
    expect(checkEntry(entry("a", { roomId: "small" }), [], r, ctx)).toHaveLength(0);
  });
});

describe("soft constraints", () => {
  it("warns about the lunch break", () => {
    const v = checkEntry(entry("a", { startMin: 690, endMin: 750 }), [], [rule("LUNCH_BREAK", { startMin: 720, endMin: 780 })], ctx);
    expect(v[0].hard).toBe(false);
  });

  it("counts back-to-back classes", () => {
    const others = [entry("b", { startMin: 540, endMin: 600 }), entry("c", { startMin: 600, endMin: 660 })];
    const r = [rule("MAX_CONSECUTIVE", { maxConsecutive: 2, appliesTo: "FACULTY" })];
    expect(checkEntry(entry("a"), others, r, ctx)[0].message).toContain("3 back-to-back");
    expect(checkEntry(entry("a"), others.slice(0, 1), r, ctx)).toHaveLength(0);
  });

  it("checks preferred hours, days off, subject time of day, and gaps", () => {
    expect(checkEntry(entry("a", { dayOfWeek: "FRIDAY" }), [], [rule("PREFERRED_TIME", { facultyId: "f1", startMin: 420, endMin: 1020, daysOff: ["FRIDAY"] })], ctx)).toHaveLength(1);
    expect(checkEntry(entry("a", { startMin: 780, endMin: 840 }), [], [rule("SUBJECT_TIME_OF_DAY", { subjectId: "math", period: "MORNING" })], ctx)).toHaveLength(1);
    expect(checkEntry(entry("a"), [entry("b", { sectionId: "secA", facultyId: "x", startMin: 545, endMin: 600 })], [rule("MINIMUM_GAP", { minutes: 15, appliesTo: "SECTION" })], ctx)).toHaveLength(1);
  });

  it("ignores rules with invalid settings", () => {
    expect(checkEntry(entry("a"), [], [rule("LUNCH_BREAK", { startMin: "noon" })], ctx)).toHaveLength(0);
  });
});

describe("constraint report", () => {
  it("reports a double booking once and lists both classes", () => {
    const v = checkAll([entry("a"), entry("b", { sectionId: "secB" })], [rule("NO_DOUBLE_BOOKING")], ctx);
    expect(v).toHaveLength(1);
    expect(v[0].entryIds.sort()).toEqual(["a", "b"]);
  });

  it("lists hard violations before soft ones", () => {
    const v = checkAll([entry("a", { roomId: "small", startMin: 700, endMin: 760 })], [rule("LUNCH_BREAK", { startMin: 720, endMin: 780 }), rule("ROOM_CAPACITY")], ctx);
    expect(v.map((x) => x.hard)).toEqual([true, false]);
  });
});
