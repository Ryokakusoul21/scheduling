import { describe, expect, it } from "vitest";
import { checkEntry, PARAM_SCHEMAS, withPriorityRooms, type ConstraintRule } from "@/lib/scheduler/constraints";

const rule = (facultyId: string, roomId: string): ConstraintRule => ({ id: `${facultyId}-${roomId}`, kind: "ROOM_PRIORITY", name: "Room priority", params: { roomId, facultyId }, departmentId: null });

describe("room priority constraint", () => {
  it("puts priority rooms ahead of the faculty member's own preferences without duplicates", () => {
    expect(withPriorityRooms("f1", ["r2", "r1"], [rule("f1", "r1"), rule("f2", "r3")])).toEqual(["r1", "r2"]);
    expect(withPriorityRooms("f3", ["r2"], [rule("f1", "r1")])).toEqual(["r2"]);
  });
  it("requires a room and a faculty member", () => {
    expect(PARAM_SCHEMAS.ROOM_PRIORITY.safeParse({ roomId: "", facultyId: "f1" }).success).toBe(false);
  });
  it("never reports a violation when someone else uses the room", () => {
    const ctx = { rooms: new Map(), sections: new Map(), subjects: new Map(), faculty: new Map(), programNames: new Map() };
    const entry = { sectionId: "s", subjectId: "sub", facultyId: "f2", roomId: "r1", dayOfWeek: "MONDAY" as const, startMin: 480, endMin: 540, semesterId: "t", component: "LECTURE" as const };
    expect(checkEntry(entry as never, [], [rule("f1", "r1")], ctx)).toEqual([]);
  });
});
