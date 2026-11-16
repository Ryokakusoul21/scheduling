import { describe, expect, it } from "vitest";
import { scheduleInsights, weeklyAvailableHours, type InsightMeeting } from "@/lib/analytics/schedule-insights";
import { HEATMAP_DAYS, HEATMAP_HOURS, peakHeatmap } from "@/lib/analytics/timetable";

const meeting = (id: string, override: Partial<InsightMeeting> = {}): InsightMeeting => ({ id, roomId: `r-${id}`, facultyId: `f-${id}`, sectionId: `s-${id}`, dayOfWeek: "MONDAY", startMin: 480, endMin: 540, status: "PUBLISHED", termStart: "2026-10-01", termEnd: "2026-10-31", ...override });

describe("schedule insights", () => {
  it("summarizes selected workflow stages, hours, unique resources and a seven-day week", () => {
    const data = scheduleInsights([meeting("a"), meeting("b", { status: "REVIEW", endMin: 570 }), meeting("c", { status: "DRAFT", dayOfWeek: "SUNDAY", facultyId: "f-a" }), meeting("archived", { status: "ARCHIVED" })]);
    expect(data).toMatchObject({ total: 3, weeklyHours: 3.5, published: 1, publicationRate: 33.3, faculty: 2, rooms: 3, sections: 3, conflictPairs: 0 });
    expect(data.daily).toHaveLength(7);
    expect(data.daily.find((day) => day.day === "SUNDAY")).toMatchObject({ count: 1, hours: 1 });
  });

  it("counts a meeting pair once even when it shares a room, faculty, and section", () => {
    const first = meeting("a");
    const second = { ...first, id: "b", startMin: 510, endMin: 570 };
    expect(scheduleInsights([first, second])).toMatchObject({ conflictPairs: 1, conflictIds: ["a", "b"], resourceConflicts: { room: 1, faculty: 1, section: 1 } });
  });

  it("finds faculty and section collisions across different rooms", () => {
    expect(scheduleInsights([meeting("a"), meeting("b", { facultyId: "f-a" })]).resourceConflicts).toEqual({ room: 0, faculty: 1, section: 0 });
    expect(scheduleInsights([meeting("a"), meeting("b", { sectionId: "s-a" })]).resourceConflicts).toEqual({ room: 0, faculty: 0, section: 1 });
  });

  it("allows back-to-back meetings and matching slots in non-overlapping terms", () => {
    expect(scheduleInsights([meeting("a"), meeting("b", { roomId: "r-a", startMin: 540, endMin: 600 })]).conflictPairs).toBe(0);
    expect(scheduleInsights([meeting("a"), meeting("b", { roomId: "r-a", termStart: "2026-11-01", termEnd: "2026-12-31" })]).conflictPairs).toBe(0);
  });

  it("does not flag term intersections that contain no occurrence of the weekday", () => {
    // October 31 is Saturday; these terms share only a Saturday and Sunday.
    const first = meeting("a", { termEnd: "2026-11-01" });
    const second = meeting("b", { roomId: "r-a", termStart: "2026-10-31" });
    expect(scheduleInsights([first, second]).conflictPairs).toBe(0);
  });

  it("deduplicates overlapping events affecting the same dated class occurrence", () => {
    const data = scheduleInsights([meeting("a", { affects: [{ date: "2026-10-12" }, { date: "2026-10-12" }, { date: "2026-10-19" }] }), meeting("b")]);
    expect(data).toMatchObject({ affectedMeetings: 1, affectedOccurrences: 2 });
  });

  it("handles empty selections and invalid durations without NaN or negative hours", () => {
    expect(scheduleInsights([])).toMatchObject({ total: 0, weeklyHours: 0, publicationRate: 0, conflictPairs: 0 });
    expect(scheduleInsights([meeting("a", { endMin: 400 })])).toMatchObject({ weeklyHours: 0, conflictPairs: 0 });
  });

  it("includes Sunday classes in the peak-hour heatmap", () => {
    const row = { ...meeting("a"), dayOfWeek: "SUNDAY" as const };
    expect(peakHeatmap([row])[HEATMAP_DAYS.indexOf("SUNDAY")][HEATMAP_HOURS.indexOf(8)]).toBe(1);
  });
});

describe("weekly room availability", () => {
  it("merges overlapping and duplicate windows without adding minutes twice", () => {
    expect(weeklyAvailableHours([
      { dayOfWeek: "MONDAY", startMin: 480, endMin: 600 }, { dayOfWeek: "MONDAY", startMin: 540, endMin: 660 },
      { dayOfWeek: "MONDAY", startMin: 480, endMin: 600 }, { dayOfWeek: "TUESDAY", startMin: 480, endMin: 600 },
    ])).toBe(5);
  });

  it("uses the documented fallback only when no windows are configured", () => {
    expect(weeklyAvailableHours([])).toBe(72);
    expect(weeklyAvailableHours([], 60)).toBe(60);
    expect(weeklyAvailableHours([{ dayOfWeek: "MONDAY", startMin: 500, endMin: 400 }])).toBe(0);
  });
});
