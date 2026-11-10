import { describe, expect, it } from "vitest";
import { latestTimetables, sectionReadiness, teachingDay, type TeachingSession } from "@/lib/dashboard/summary";
import { nowAndNext } from "@/lib/student/schedule";
import type { PortalClass, PortalMove } from "@/lib/student/portal";

describe("dashboard scheduling summaries", () => {
  const session = (id: string, date: string, startMin: number, endMin: number): TeachingSession => ({ id, date, startMin, endMin, title: id, room: "101", changed: false });

  it("distinguishes a current class from the next meeting, including moved dates", () => {
    const rows = [session("tomorrow", "2026-11-11", 480, 540), session("now", "2026-11-10", 540, 600), session("later", "2026-11-10", 660, 720)];
    const result = teachingDay(rows, "2026-11-10", 570);
    expect(result.current?.id).toBe("now");
    expect(result.next?.id).toBe("later");
    expect(result.remaining).toBe(2);
    expect(teachingDay(rows, "2026-11-10", 720).next?.id).toBe("tomorrow");
    expect(teachingDay(rows, "2026-11-11", 540).remaining).toBe(0);
  });

  it("does not count multiple weekly meetings as separate curriculum components", () => {
    const lecture = { subjectId: "it", component: "LECTURE" };
    const lab = { subjectId: "it", component: "LABORATORY" };
    expect(sectionReadiness([{ id: "s", name: "IT 1-A", schedules: [lecture, lecture], classPlaceholders: [lecture, lab] }])[0]).toMatchObject({ scheduled: 1, planned: 2, missing: 1 });
  });

  it("keeps the newest submission without hiding separate examination periods", () => {
    const base = { departmentId: "ccs", semesterId: "term", kind: "CLASS", examType: null };
    const rows = [{ ...base, version: 3 }, { ...base, version: 1 }, { ...base, kind: "EXAMINATION", examType: "MIDTERM", version: 1 }, { ...base, kind: "EXAMINATION", examType: "FINAL", version: 2 }];
    expect(latestTimetables(rows).map((row) => [row.kind, row.examType, row.version])).toEqual([["CLASS", null, 3], ["EXAMINATION", "MIDTERM", 1], ["EXAMINATION", "FINAL", 2]]);
  });
});

describe("student landing uses actual class changes", () => {
  const cls: PortalClass = { id: "class", dayOfWeek: "TUESDAY", startMin: 540, endMin: 600, component: "LECTURE", subjectCode: "IT101", subjectName: "Computing", units: 3, faculty: "Teacher", facultyEmail: "teacher@example.test", room: "101", roomType: "Lecture room", building: "Main", buildingLocation: null, floor: null };
  const move: PortalMove = { id: "move", scheduleId: "class", subjectCode: "IT101", subjectName: "Computing", date: "2026-11-10", newDate: "2026-11-11", kind: "MOVED", room: "202", startMin: 600, endMin: 660, fromRoom: "101", fromStartMin: 540, fromEndMin: 600, reason: "Room change" };

  it("removes a moved class from its original day and uses its new time and room", () => {
    const result = nowAndNext([cls], [], new Date("2026-11-10T08:00:00+08:00"), [move]);
    expect(result.today).toEqual([]);
    expect(result.next).toMatchObject({ date: "2026-11-11", cls: { room: "202", startMin: 600, building: null } });
  });

  it("shows online meetings without their previous room or building", () => {
    const result = nowAndNext([cls], [], new Date("2026-11-10T09:30:00+08:00"), [{ ...move, kind: "ONLINE", newDate: null, startMin: 540, endMin: 600 }]);
    expect(result.today[0]).toMatchObject({ live: true, room: "Online or asynchronous", building: null });
  });

  it("does not let a move for another schedule replace this student's class", () => {
    const result = nowAndNext([cls], [], new Date("2026-11-10T08:00:00+08:00"), [{ ...move, scheduleId: "another-class" }]);
    expect(result.today[0].room).toBe("101");
    expect(result.next?.date).toBe("2026-11-10");
  });
});
