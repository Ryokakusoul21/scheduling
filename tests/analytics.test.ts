import { describe, expect, it } from "vitest";
import { byGroup, facultyUtilization, overall, peakHeatmap, roomUtilization, HEATMAP_HOURS } from "@/lib/analytics/timetable";

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

  it("counts meetings in session per day and hour", () => {
    const grid = peakHeatmap(meetings);
    const at = (day: number, hour: number) => grid[day][HEATMAP_HOURS.indexOf(hour)];
    expect(at(0, 8)).toBe(1);
    expect(at(0, 10)).toBe(1);
    expect(at(1, 7)).toBe(1);
    expect(at(1, 9)).toBe(0);
  });
});
