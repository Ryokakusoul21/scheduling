import { describe, it, expect } from "vitest";
import { DEFAULT_TIMETABLE, effectiveTimetable, timetableConfigSchema, timetableTimeError, timetableGrid, timetableDisplayDays, timetableTicks, timetableStarts, snapTimetableTime, withinSchool, type TimetableConfig } from "@/lib/timetable/config";
import { reportHtml, timetableDoc } from "@/lib/export/report";
import { generateExaminationSchedule } from "@/lib/examinations/auto-schedule";
import { defaultDuration } from "@/lib/scheduler/timetable";

const flexible: TimetableConfig = { ...DEFAULT_TIMETABLE, mode: "DYNAMIC", adjustmentStep: 5, dayStart: 425, days: ["MONDAY", "SUNDAY"] };
describe("shared timetable configuration", () => {
  it("loads old configurations with existing defaults and lets the department choose split or block meetings", () => {
    const legacy = { ...DEFAULT_TIMETABLE, classSession: undefined };
    expect(timetableConfigSchema.parse(legacy).classSession).toBe("DEFAULT");
    expect(defaultDuration("LECTURE", "COLLEGE", timetableConfigSchema.parse(legacy))).toBe(180);
    expect(defaultDuration("LABORATORY", "COLLEGE", { classSession: "SPLIT_90" })).toBe(90);
    expect(defaultDuration("LECTURE", "COLLEGE", { classSession: "BLOCK_180" })).toBe(180);
    expect(timetableConfigSchema.safeParse({ ...DEFAULT_TIMETABLE, classSession: "SPLIT_90", gridInterval: 60 }).success).toBe(false);
    const bundle = { school: DEFAULT_TIMETABLE, overrides: { "timetable:term:cs": { ...DEFAULT_TIMETABLE, classSession: "BLOCK_180" as const } } };
    expect(effectiveTimetable(bundle, "cs", "term").classSession).toBe("BLOCK_180");
    expect(effectiveTimetable(bundle, "other", "term").classSession).toBe("DEFAULT");
  });
  it("separates dynamic adjustment from visual rows and anchors snapping at opening time", () => {
    expect(timetableTimeError(flexible, { dayOfWeek: "MONDAY", startMin: 430, endMin: 475 })).toBeNull();
    expect(timetableTimeError({ ...flexible, mode: "STATIC" }, { dayOfWeek: "MONDAY", startMin: 430, endMin: 475 })).toContain("30-minute");
    expect(snapTimetableTime(438, { ...flexible, mode: "STATIC" }, "MONDAY")).toBe(425);
    expect(snapTimetableTime(438, flexible, "MONDAY")).toBe(440);
    expect(timetableGrid(flexible)).toMatchObject({ slot: 30, snapStep: 5 });
  });
  it("checks days, daily hours, breaks and endpoints", () => {
    const config = { ...flexible, dayHours: { MONDAY: { startMin: 480, endMin: 1020 } }, breaks: [{ name: "Lunch", days: ["MONDAY" as const], startMin: 720, endMin: 780 }] };
    expect(timetableTimeError(config, { dayOfWeek: "TUESDAY", startMin: 480, endMin: 540 })).toContain("day is not enabled");
    expect(timetableTimeError(config, { dayOfWeek: "MONDAY", startMin: 475, endMin: 540 })).toContain("operating hours");
    expect(timetableTimeError(config, { dayOfWeek: "MONDAY", startMin: 690, endMin: 735 })).toContain("Lunch");
    expect(timetableTimeError(config, { dayOfWeek: "MONDAY", startMin: 780, endMin: 825 })).toBeNull();
    expect(timetableTimeError(config, { dayOfWeek: "MONDAY", startMin: 780, endMin: 826 })).toContain("5-minute");
    expect(timetableConfigSchema.safeParse({ ...config, dayEnd: 400 }).success).toBe(false);
  });
  it("keeps school breaks mandatory, supports term and department inheritance and deduplicates", () => {
    const lunch = { name: "Lunch", days: ["MONDAY" as const], startMin: 720, endMin: 780 };
    const bundle = { school: { ...DEFAULT_TIMETABLE, breaks: [lunch] }, overrides: { "timetable:term:school": { ...DEFAULT_TIMETABLE, dayStart: 450 }, "timetable:term:cs": { ...DEFAULT_TIMETABLE, mode: "DYNAMIC" as const, dayStart: 480, breaks: [lunch] } } };
    const config = effectiveTimetable(bundle, "cs", "term");
    expect(config.mode).toBe("DYNAMIC"); expect(config.breaks).toHaveLength(1);
    expect(effectiveTimetable(bundle, "other", "term").dayStart).toBe(450);
    expect(effectiveTimetable(bundle, "cs", "other").dayStart).toBe(420);
    expect(withinSchool({ ...DEFAULT_TIMETABLE, dayStart: 400 }, DEFAULT_TIMETABLE)).toBe(false);
    expect(withinSchool({ ...DEFAULT_TIMETABLE, days: ["SUNDAY"] }, DEFAULT_TIMETABLE)).toBe(false);
  });
  it("keeps old times and disabled days visible and preserves exact print boundaries", () => {
    const entries = [{ dayOfWeek: "SUNDAY" as const, startMin: 365, endMin: 472 }];
    const original = structuredClone(entries);
    expect(timetableGrid(DEFAULT_TIMETABLE, entries)).toMatchObject({ dayStart: 365, dayEnd: 1140 });
    expect(timetableDisplayDays(DEFAULT_TIMETABLE, entries)).toContain("SUNDAY");
    expect(timetableTicks(DEFAULT_TIMETABLE, entries)).toContain(472);
    expect(timetableGrid({ ...DEFAULT_TIMETABLE, autoFit: true }, entries)).toMatchObject({ dayStart: 360, dayEnd: 480 });
    const html = reportHtml(timetableDoc("Class", "Term", [{ ...entries[0], subject: "IT - Programming", component: "LECTURE", section: "1A", faculty: "Teacher", room: "R1" }], "class", { timeConfig: { ...DEFAULT_TIMETABLE, hour12: false } }));
    expect(html).toContain("06:05"); expect(html).toContain("07:52"); expect(html).toContain("SUNDAY");
    expect(entries).toEqual(original);
  });
  it("generates exact permitted starts without crossing breaks or changing a duration", () => {
    const config = { ...flexible, dayEnd: 500, breaks: [{ name: "Break", days: ["MONDAY" as const], startMin: 450, endMin: 460 }] };
    const starts = timetableStarts(config, "MONDAY", 30);
    expect(starts).toEqual([460, 465, 470]);
    expect(timetableStarts(config, "TUESDAY", 30)).toEqual([]);
    expect(timetableStarts({ ...config, mode: "STATIC" }, "MONDAY", 45)).toEqual([]);
  });
  it("auto-schedules an examination on a configured Sunday with a five-minute boundary", () => {
    const config: TimetableConfig = { ...flexible, days: ["SUNDAY"], dayStart: 425, dayEnd: 470 };
    const result = generateExaminationSchedule([{ sectionId: "s", sectionName: "1A", sectionLevel: "COLLEGE", yearLevel: "FIRST", gradeLevel: null, studentCount: 20, subjectId: "it", subjectCode: "IT", proctorId: "f", proctorName: "Teacher", proctorDayOff: null, proctorAvailability: [], roomId: "r", startMin: 425, endMin: 470 }], [], [{ id: "r", roomName: "R1", capacity: 30, availability: [] }], { window: { start: "2026-11-15", end: "2026-11-15" }, blockedDates: new Map(), roomCapacity: new Map([["r", 30]]), sectionSize: new Map([["s", 20]]) }, [], [], { s: config });
    expect(result.unscheduled).toEqual([]);
    expect(result.proposals[0]).toMatchObject({ date: "2026-11-15", startMin: 425, endMin: 470 });
  });
});
