import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID,
  clampStart,
  defaultDuration,
  formatRange,
  gridHeight,
  indexConflicts,
  layoutLanes,
  minutesToY,
  remainingNeeds,
  subjectAppliesToSection,
  yToMinutes,
} from "@/lib/scheduler/timetable";
import { isOverlapConflict } from "@/lib/scheduler/conflictDetector";
import type { DetectedConflict } from "@/lib/scheduler/types";

const g = DEFAULT_GRID; // 7:00–19:00, 30-min rows, 28px each

describe("grid geometry (drag-and-drop drop targets)", () => {
  it("maps times to pixels and back", () => {
    expect(minutesToY(7 * 60, g)).toBe(0);
    expect(minutesToY(8 * 60, g)).toBe(56);
    expect(gridHeight(g)).toBe(24 * 28);
    expect(yToMinutes(56, g)).toBe(8 * 60);
  });

  it("snaps a drop position to the nearest 30-minute slot", () => {
    expect(yToMinutes(56 + 10, g)).toBe(8 * 60); // slightly below 8:00
    expect(yToMinutes(56 + 20, g)).toBe(8 * 60 + 30); // closer to 8:30
    expect(yToMinutes(-40, g)).toBe(6 * 60 + 30); // above the grid (clamped later)
  });

  it("keeps a dropped class inside the school day", () => {
    expect(clampStart(6 * 60, 90, g)).toBe(7 * 60);
    expect(clampStart(18 * 60 + 30, 90, g)).toBe(17 * 60 + 30);
    expect(clampStart(10 * 60, 90, g)).toBe(10 * 60);
  });

  it("formats time ranges in 12-hour time", () => {
    expect(formatRange(13 * 60, 14 * 60 + 30)).toBe("1:00 PM – 2:30 PM");
    expect(formatRange(12 * 60, 12 * 60 + 30)).toBe("12:00 PM – 12:30 PM");
  });
});

describe("layoutLanes", () => {
  it("gives non-overlapping blocks the full width", () => {
    const lanes = layoutLanes([
      { id: "a", startMin: 480, endMin: 540 },
      { id: "b", startMin: 540, endMin: 600 },
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(lanes.get("b")).toEqual({ lane: 0, lanes: 1 });
  });

  it("puts overlapping blocks side by side and reuses freed lanes", () => {
    const lanes = layoutLanes([
      { id: "a", startMin: 480, endMin: 600 },
      { id: "b", startMin: 510, endMin: 570 },
      { id: "c", startMin: 570, endMin: 630 },
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get("c")).toEqual({ lane: 1, lanes: 2 }); // reuses b's lane
  });
});

describe("indexConflicts", () => {
  it("marks both entries, and overlap beats warning", () => {
    const base = { component: "LECTURE" as const, dayOfWeek: "MONDAY" as const, startMin: 0, endMin: 60, subjectId: "s", sectionId: "x", facultyId: "f", roomId: "r" };
    const conflicts: DetectedConflict[] = [
      { type: "CAPACITY_CONFLICT", severity: "HIGH", description: "too many", entryA: { ...base, id: "a" } },
      { type: "ROOM_CONFLICT", severity: "CRITICAL", description: "room", entryA: { ...base, id: "a" }, entryB: { ...base, id: "b" } },
    ];
    const idx = indexConflicts(conflicts, isOverlapConflict);
    expect(idx.get("a")?.severity).toBe("conflict");
    expect(idx.get("a")?.messages).toHaveLength(2);
    expect(idx.get("b")?.severity).toBe("conflict");
  });
});

describe("remainingNeeds ('To schedule' panel)", () => {
  const subjects = [
    { id: "it101", lectureHours: 2, labHours: 1 },
    { id: "ge101", lectureHours: 3, labHours: 0 },
  ];

  it("lists lecture and lab hours still to place", () => {
    const needs = remainingNeeds({ id: "sec" }, subjects, [
      { sectionId: "sec", subjectId: "it101", component: "LECTURE", startMin: 480, endMin: 600 }, // 2h lecture done
      { sectionId: "sec", subjectId: "ge101", component: "LECTURE", startMin: 480, endMin: 570 }, // 1.5h of 3h
    ]);
    expect(needs).toEqual([
      { subjectId: "it101", sectionId: "sec", component: "LABORATORY", requiredMin: 60, scheduledMin: 0 },
      { subjectId: "ge101", sectionId: "sec", component: "LECTURE", requiredMin: 180, scheduledMin: 90 },
    ]);
  });

  it("ignores other sections' classes", () => {
    const needs = remainingNeeds({ id: "sec" }, [subjects[1]], [
      { sectionId: "other", subjectId: "ge101", component: "LECTURE", startMin: 0, endMin: 180 },
    ]);
    expect(needs[0].scheduledMin).toBe(0);
  });

  it("uses longer default meetings for College than basic education", () => {
    expect(defaultDuration("LECTURE", "COLLEGE")).toBeGreaterThan(defaultDuration("LECTURE", "JUNIOR_HIGH"));
  });
});

describe("subjectAppliesToSection", () => {
  const section = { level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", gradeLevel: null };
  it("matches course + year, general-ed, and any-year subjects", () => {
    expect(subjectAppliesToSection({ level: "COLLEGE", programId: "bsit", yearLevel: "FIRST", gradeLevel: null }, section)).toBe(true);
    expect(subjectAppliesToSection({ level: "COLLEGE", programId: null, yearLevel: "FIRST", gradeLevel: null }, section)).toBe(true);
    expect(subjectAppliesToSection({ level: "COLLEGE", programId: "bsit", yearLevel: null, gradeLevel: null }, section)).toBe(true);
  });
  it("rejects other courses, years, and levels", () => {
    expect(subjectAppliesToSection({ level: "COLLEGE", programId: "bscs", yearLevel: "FIRST", gradeLevel: null }, section)).toBe(false);
    expect(subjectAppliesToSection({ level: "COLLEGE", programId: "bsit", yearLevel: "SECOND", gradeLevel: null }, section)).toBe(false);
    expect(subjectAppliesToSection({ level: "SENIOR_HIGH", programId: null, yearLevel: null, gradeLevel: "GRADE_11" }, section)).toBe(false);
  });
  it("matches SHS core and strand subjects by grade", () => {
    const shs = { level: "SENIOR_HIGH", programId: "stem", yearLevel: null, gradeLevel: "GRADE_11" };
    expect(subjectAppliesToSection({ level: "SENIOR_HIGH", programId: null, yearLevel: null, gradeLevel: "GRADE_11" }, shs)).toBe(true);
    expect(subjectAppliesToSection({ level: "SENIOR_HIGH", programId: "abm", yearLevel: null, gradeLevel: "GRADE_11" }, shs)).toBe(false);
    expect(subjectAppliesToSection({ level: "SENIOR_HIGH", programId: null, yearLevel: null, gradeLevel: "GRADE_12" }, shs)).toBe(false);
  });
});
