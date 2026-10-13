import { describe, expect, it } from "vitest";
import { byGroup, facultyUtilization, overall, peakHeatmap, roomUtilization, HEATMAP_HOURS } from "@/lib/analytics/timetable";
import { countChange, extremes, rateChange, weeklyCounts } from "@/lib/analytics/trends";

const meetings = [
  { roomId: "r1", facultyId: "f1", dayOfWeek: "MONDAY" as const, startMin: 480, endMin: 600 },
  { roomId: "r1", facultyId: "f2", dayOfWeek: "MONDAY" as const, startMin: 600, endMin: 660 },
  { roomId: "r2", facultyId: "f1", dayOfWeek: "TUESDAY" as const, startMin: 450, endMin: 540 },
];

describe("timetable analytics", () => {
  it("computes room utilization per room, building, and overall", () => {
    const rows = roomUtilization(meetings, [
      { id: "r1", name: "Room 1", building: "Main", availableHours: 60 },
      { id: "r2", name: "Room 2", building: "Main", availableHours: 60 },
      { id: "r3", name: "Room 3", building: "Annex", availableHours: 60 },
    ]);
    expect(rows[0]).toMatchObject({ id: "r1", usedHours: 3, rate: 5 });
    expect(byGroup(rows).find((g) => g.name === "Main")).toMatchObject({ usedHours: 4.5, capacityHours: 120, rate: 3.8 });
    expect(overall(rows).rate).toBe(2.5);
  });

  it("computes faculty utilization against maximum hours", () => {
    const rows = facultyUtilization(meetings, [{ id: "f1", name: "A", department: "D", maxHours: 7 }, { id: "f2", name: "B", department: "D", maxHours: 10 }]);
    expect(rows[0]).toMatchObject({ id: "f1", usedHours: 3.5, rate: 50 });
  });

  it("compares with the previous semester as percent or percentage points", () => {
    expect(countChange(110, 100)).toMatchObject({ value: 10, unit: "percent" });
    expect(countChange(5, null).value).toBeNull();
    expect(countChange(5, 0).value).toBeNull();
    expect(rateChange(42.5, 40, true)).toMatchObject({ value: 2.5, unit: "points" });
  });

  it("buckets dates into Monday-to-Sunday weeks", () => {
    // 2026-10-12 is a Monday.
    const rows = weeklyCounts("2026-10-14", "2026-10-25", { bookings: ["2026-10-12", "2026-10-18", "2026-10-19"], conflicts: ["2026-10-25"] });
    expect(rows).toEqual([
      { week: "2026-10-12", bookings: 2, conflicts: 0 },
      { week: "2026-10-19", bookings: 1, conflicts: 1 },
    ]);
  });

  it("finds the most and least used rooms", () => {
    expect(extremes([{ rate: 10, capacityHours: 60 }, { rate: 80, capacityHours: 60 }, { rate: 0, capacityHours: 0 }, { rate: 5, capacityHours: 60 }])).toEqual({ most: 1, least: 3 });
  });

  it("counts meetings in session per day and hour", () => {
    const grid = peakHeatmap(meetings);
    const at = (day: number, hour: number) => grid[day][HEATMAP_HOURS.indexOf(hour)];
    expect(at(0, 8)).toBe(1);
    expect(at(0, 10)).toBe(1);
    expect(at(1, 7)).toBe(1);
    expect(at(1, 9)).toBe(0);
  });
});
