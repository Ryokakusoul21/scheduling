import { describe, expect, it } from "vitest";
import { detectConflicts, isOverlapConflict, type ConflictContext } from "@/lib/scheduler/conflictDetector";
import type { SchedEntry } from "@/lib/scheduler/types";

const day = 24 * 60 * 60 * 1000;

function ctx(overrides: Partial<ConflictContext> = {}): ConflictContext {
  return {
    facultyById: new Map([
      ["f1", { id: "f1", fullName: "Prof. A", maxHours: 24, availability: [], assignedHours: 0 }],
      ["f2", { id: "f2", fullName: "Prof. B", maxHours: 24, availability: [], assignedHours: 0 }],
    ]),
    roomById: new Map([
      ["r1", { id: "r1", roomNumber: "101", roomName: "Room 101", capacity: 40, roomType: "LECTURE_ROOM", availability: [], status: "AVAILABLE" }],
      ["r2", { id: "r2", roomNumber: "102", roomName: "Room 102", capacity: 40, roomType: "LECTURE_ROOM", availability: [], status: "AVAILABLE" }],
      ["lab", { id: "lab", roomNumber: "LAB1", roomName: "Lab 1", capacity: 40, roomType: "COMPUTER_LABORATORY", availability: [], status: "AVAILABLE" }],
    ]),
    subjectById: new Map([["s1", { id: "s1", code: "IT101", name: "Intro", lectureHours: 2, labHours: 1, requiredRoomType: "COMPUTER_LABORATORY" }]]),
    sectionStudentCountById: new Map([
      ["secA", 35],
      ["secB", 35],
      ["big", 60],
    ]),
    ...overrides,
  };
}

function entry(id: string, patch: Partial<SchedEntry> = {}): SchedEntry {
  return {
    id,
    subjectId: "s1",
    sectionId: "secA",
    facultyId: "f1",
    roomId: "r1",
    component: "LECTURE",
    dayOfWeek: "MONDAY",
    startMin: 8 * 60,
    endMin: 9 * 60 + 30,
    ...patch,
  };
}

const types = (cs: { type: string }[]) => cs.map((c) => c.type).sort();

describe("detectConflicts — double bookings", () => {
  it("flags a faculty member teaching two sections at once", () => {
    const cs = detectConflicts([entry("a"), entry("b", { sectionId: "secB", roomId: "r2" })], ctx());
    expect(types(cs)).toEqual(["FACULTY_CONFLICT"]);
    expect(cs[0].entryA.id).toBe("a");
    expect(cs[0].entryB?.id).toBe("b");
  });

  it("flags a room booked twice", () => {
    const cs = detectConflicts([entry("a"), entry("b", { sectionId: "secB", facultyId: "f2" })], ctx());
    expect(types(cs)).toEqual(["ROOM_CONFLICT"]);
  });

  it("flags a section with two classes at the same time", () => {
    const cs = detectConflicts([entry("a"), entry("b", { facultyId: "f2", roomId: "r2" })], ctx());
    expect(types(cs)).toEqual(["SECTION_CONFLICT"]);
  });

  it("reports every overlap type when everything clashes", () => {
    const cs = detectConflicts([entry("a"), entry("b")], ctx());
    expect(types(cs)).toEqual(["FACULTY_CONFLICT", "ROOM_CONFLICT", "SECTION_CONFLICT"]);
    expect(cs.every(isOverlapConflict)).toBe(true);
  });

  it("does not flag back-to-back classes (end == next start)", () => {
    const cs = detectConflicts([entry("a"), entry("b", { startMin: 9 * 60 + 30, endMin: 11 * 60 })], ctx());
    expect(cs).toHaveLength(0);
  });

  it("does not flag the same slot on different days", () => {
    const cs = detectConflicts([entry("a"), entry("b", { dayOfWeek: "TUESDAY" })], ctx());
    expect(cs).toHaveLength(0);
  });
});

describe("detectConflicts — term awareness", () => {
  const termRanges = new Map([
    ["q1", { start: Date.UTC(2025, 7, 4), end: Date.UTC(2025, 9, 17) }],
    ["q2", { start: Date.UTC(2025, 9, 20), end: Date.UTC(2026, 0, 16) }],
    ["sem1", { start: Date.UTC(2025, 7, 1), end: Date.UTC(2025, 11, 15) }],
  ]);

  it("ignores clashes between terms that never run at the same time (Q1 vs Q2)", () => {
    const cs = detectConflicts([entry("a", { semesterId: "q1" }), entry("b", { semesterId: "q2", sectionId: "secB" })], ctx({ termRanges }));
    expect(cs).toHaveLength(0);
  });

  it("catches a teacher double-booked across a College semester and an SHS quarter", () => {
    const cs = detectConflicts(
      [entry("college", { semesterId: "sem1" }), entry("shs", { semesterId: "q1", sectionId: "secB", roomId: "r2" })],
      ctx({ termRanges })
    );
    expect(types(cs)).toEqual(["FACULTY_CONFLICT"]);
  });

  it("treats unknown terms as concurrent (fails safe)", () => {
    const cs = detectConflicts([entry("a", { semesterId: "x" }), entry("b", { semesterId: "y" })], ctx({ termRanges: new Map([["x", { start: 0, end: day }]]) }));
    expect(cs.length).toBeGreaterThan(0);
  });
});

describe("detectConflicts — warnings", () => {
  it("warns when enrollment exceeds room capacity", () => {
    const cs = detectConflicts([entry("a", { sectionId: "big" })], ctx());
    expect(types(cs)).toEqual(["CAPACITY_CONFLICT"]);
    expect(isOverlapConflict(cs[0])).toBe(false);
  });

  it("warns when a lab component is not in a laboratory", () => {
    const cs = detectConflicts([entry("a", { component: "LABORATORY" })], ctx());
    expect(types(cs)).toEqual(["SUBJECT_REQUIREMENT_CONFLICT"]);
  });

  it("accepts a lab component in a laboratory", () => {
    expect(detectConflicts([entry("a", { component: "LABORATORY", roomId: "lab" })], ctx())).toHaveLength(0);
  });

  it("warns when the teacher is outside their availability", () => {
    const c = ctx();
    c.facultyById.set("f1", { id: "f1", fullName: "Prof. A", maxHours: 24, assignedHours: 0, availability: [{ dayOfWeek: "MONDAY", startMin: 13 * 60, endMin: 17 * 60 }] });
    expect(types(detectConflicts([entry("a")], c))).toEqual(["AVAILABILITY_CONFLICT"]);
  });
});
