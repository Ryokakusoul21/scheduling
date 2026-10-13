import { describe, expect, it } from "vitest";
import {
  addDays,
  commitRelocation,
  dayOfWeek,
  expandSessions,
  findClashes,
  makeUpOptions,
  relocate,
  sessionOccupant,
  type FacultyInfo,
  type PlanContext,
  type WeeklyClass,
} from "@/lib/occupancy/engine";

// 2026-10-12 is a Monday.
const MONDAY = "2026-10-12";
const term = { id: "t1", start: "2026-08-03", end: "2026-12-18" };
const cls = (id: string, over: Partial<WeeklyClass> = {}): WeeklyClass => ({
  id, semesterId: "t1", sectionId: "s1", subjectId: "sub1", facultyId: "f1", roomId: "r1",
  component: "LECTURE", dayOfWeek: "MONDAY", startMin: 480, endMin: 570, ...over,
});
const fac = (id: string, departmentId = "d1"): FacultyInfo => ({ id, name: id.toUpperCase(), departmentId, teachingLevels: ["COLLEGE"], availability: [] });

function ctxFor(classes: WeeklyClass[]): PlanContext {
  const sessions = expandSessions(classes, [term], [], MONDAY, MONDAY);
  return {
    rooms: [
      { id: "r1", name: "Room 1", capacity: 40, roomType: "LECTURE_ROOM", status: "AVAILABLE", buildingId: "b1" },
      { id: "r2", name: "Room 2", capacity: 40, roomType: "LECTURE_ROOM", status: "AVAILABLE", buildingId: "b1" },
      { id: "small", name: "Small", capacity: 10, roomType: "LECTURE_ROOM", status: "AVAILABLE", buildingId: "b1" },
    ],
    faculty: new Map([["f1", fac("f1")], ["f2", fac("f2")], ["f3", fac("f3", "d2")]]),
    occupants: sessions.map((s) => sessionOccupant(s, s.scheduleId)),
    unavailable: [],
    holidays: new Set(),
    sectionSize: new Map([["s1", 30], ["s2", 30]]),
    sectionLevel: new Map([["s1", "COLLEGE"], ["s2", "COLLEGE"]]),
    subjectRoomType: new Map([["sub1", "LECTURE_ROOM"]]),
  };
}

describe("dates", () => {
  it("knows weekdays and adds days across months", () => {
    expect(dayOfWeek(MONDAY)).toBe("MONDAY");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("expandSessions", () => {
  it("expands weekly classes inside the term and skips holidays", () => {
    const sessions = expandSessions([cls("a")], [term], [], MONDAY, addDays(MONDAY, 13), new Set([addDays(MONDAY, 7)]));
    expect(sessions.map((s) => s.date)).toEqual([MONDAY]);
  });

  it("applies moved, cancelled, and make-up adjustments", () => {
    const sessions = expandSessions(
      [cls("a"), cls("b", { startMin: 600, endMin: 690 })],
      [term],
      [
        { scheduleId: "a", date: MONDAY, kind: "MOVED", roomId: "r2" },
        { scheduleId: "b", date: MONDAY, kind: "CANCELLED" },
        { scheduleId: "b", date: MONDAY, kind: "MAKE_UP", newDate: addDays(MONDAY, 5) },
      ],
      MONDAY,
      addDays(MONDAY, 6)
    );
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ scheduleId: "a", roomId: "r2", status: "MOVED" });
    expect(sessions[1]).toMatchObject({ scheduleId: "b", date: addDays(MONDAY, 5), status: "MAKE_UP" });
  });
});

describe("findClashes", () => {
  it("reports room, faculty, and section double-bookings", () => {
    const ctx = ctxFor([cls("a")]);
    const clashes = findClashes(ctx.occupants, { date: MONDAY, startMin: 500, endMin: 600, roomId: "r1", facultyIds: ["f1"], sectionIds: ["s9"] });
    expect(clashes[0].reasons).toEqual(["ROOM", "FACULTY"]);
    expect(findClashes(ctx.occupants, { date: MONDAY, startMin: 570, endMin: 600, roomId: "r1" })).toHaveLength(0);
  });
});

describe("relocate", () => {
  it("moves a class to the nearest suitable free room at the same time when its room is booked", () => {
    const ctx = ctxFor([cls("a")]);
    const [s] = expandSessions([cls("a")], [term], [], MONDAY, MONDAY);
    const r = relocate(s, ctx, { avoidRoomId: "r1" });
    expect(r).toMatchObject({ roomId: "r2", startMin: 480, facultyId: "f1" });
  });

  it("shifts to the nearest free time when every suitable room is taken", () => {
    const classes = [cls("a"), cls("b", { roomId: "r2", facultyId: "f2", sectionId: "s2" })];
    const ctx = ctxFor(classes);
    const [s] = expandSessions(classes, [term], [], MONDAY, MONDAY);
    const r = relocate(s, ctx, { avoidRoomId: "r1" });
    expect(r).toMatchObject({ roomId: "r2", startMin: 570 });
  });

  it("finds a same-department substitute when the faculty member is unavailable", () => {
    const ctx = ctxFor([cls("a")]);
    const [s] = expandSessions([cls("a")], [term], [], MONDAY, MONDAY);
    const r = relocate(s, ctx, { avoidFacultyId: "f1" });
    expect(r).toMatchObject({ facultyId: "f2", roomId: "r1" });
    commitRelocation(ctx, s, r, "a");
    expect(findClashes(ctx.occupants, { date: MONDAY, startMin: 480, endMin: 570, facultyIds: ["f2"] })).toHaveLength(1);
  });

  it("offers make-up slots on later days", () => {
    const ctx = ctxFor([cls("a")]);
    const [s] = expandSessions([cls("a")], [term], [], MONDAY, MONDAY);
    const options = makeUpOptions(s, ctx, MONDAY, 7, 2);
    expect(options).toHaveLength(2);
    expect(options[0].date).toBe(addDays(MONDAY, 1));
  });
});
