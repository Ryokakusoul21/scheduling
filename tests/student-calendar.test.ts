import { describe, expect, it } from "vitest";
import { calendarDays, monthActivities, monthLabel, shiftMonth } from "@/lib/student/calendar";
import { activitiesOn } from "@/lib/student/format";
import type { PortalActivity } from "@/lib/student/portal";

const activity = (id: string, startDate: string, endDate = startDate, changes: Partial<PortalActivity> = {}): PortalActivity => ({
  id, title: id, type: "SCHOOL_EVENT", description: "", startDate, endDate, startMin: null, endMin: null, ...changes,
});

describe("student activities calendar", () => {
  it.each(["2026-11", "2027-01", "2028-02"])("builds a complete Monday-first grid for %s without relying on the device timezone", (month) => {
    const dates = calendarDays(month);
    expect(dates).toHaveLength(42);
    expect(new Set(dates).size).toBe(42);
    expect(new Date(`${dates[0]}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(dates).toContain(`${month}-01`);
    expect(dates).toEqual([...dates].sort());
  });

  it("includes leap day and handles month navigation across years", () => {
    expect(calendarDays("2028-02")).toContain("2028-02-29");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(monthLabel("2026-11")).toBe("November 2026");
  });

  const rows = [
    activity("past", "2026-10-20", "2026-10-31"),
    activity("cross-month", "2026-10-30", "2026-11-02", { type: "HOLIDAY" }),
    activity("exam", "2026-11-16", "2026-11-20", { type: "EXAMINATION_WEEK", description: "Final assessments" }),
    activity("last-day", "2026-11-30", "2026-12-02"),
    activity("future", "2026-12-01"),
  ];

  it("keeps multi-day events that overlap either edge of the selected month", () => {
    expect(monthActivities(rows, "2026-11").map((row) => row.id)).toEqual(["cross-month", "exam", "last-day"]);
    expect(monthActivities(rows, "2026-12").map((row) => row.id)).toEqual(["last-day", "future"]);
  });

  it("combines type and case-insensitive text filters across titles and descriptions", () => {
    expect(monthActivities(rows, "2026-11", "EXAMINATION_WEEK", "  FINAL  ").map((row) => row.id)).toEqual(["exam"]);
    expect(monthActivities(rows, "2026-11", "HOLIDAY", "final")).toEqual([]);
    expect(monthActivities(rows, "2026-11", "", "LAST-DAY").map((row) => row.id)).toEqual(["last-day"]);
  });

  it("shows a multi-day activity on its inclusive start and end dates only", () => {
    expect(activitiesOn(rows, "2026-11-16").map((row) => row.id)).toEqual(["exam"]);
    expect(activitiesOn(rows, "2026-11-20").map((row) => row.id)).toEqual(["exam"]);
    expect(activitiesOn(rows, "2026-11-21")).toEqual([]);
  });

  it("sorts same-day activities by time without changing the original data", () => {
    const meetings = [activity("late", "2026-11-03", undefined, { startMin: 900 }), activity("early", "2026-11-03", undefined, { startMin: 480 })];
    expect(monthActivities(meetings, "2026-11").map((row) => row.id)).toEqual(["early", "late"]);
    expect(meetings.map((row) => row.id)).toEqual(["late", "early"]);
  });
});
