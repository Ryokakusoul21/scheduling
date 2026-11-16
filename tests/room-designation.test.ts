import { describe, expect, it } from "vitest";
import { roomAllowsSection } from "@/lib/rooms/designation";
import { designation } from "@/lib/rooms/rooms";
import { checkEntry, type ConstraintContext } from "@/lib/scheduler/constraints";
import { rankRooms } from "@/lib/scheduler/suggest";
import type { SchedEntry } from "@/lib/scheduler/types";

const entry: SchedEntry = { id: "class", subjectId: "subject", sectionId: "section", facultyId: "teacher", roomId: "room", component: "LECTURE", dayOfWeek: "MONDAY", startMin: 480, endMin: 540 };

describe("unified room department designation", () => {
  it("keeps Unassigned distinct from shared rooms and excludes it from scheduling", () => {
    const room = { departmentId: null, isGeneralShared: false };
    expect(roomAllowsSection(room, { level: "COLLEGE", departmentId: "coics" })).toBe(false);
    expect(roomAllowsSection(room, { level: "ELEMENTARY", departmentId: null })).toBe(false);
    expect(roomAllowsSection({ departmentId: null, programIds: [] }, { departmentId: "coics" })).toBe(false);
    expect(designation({ departmentId: "", departmentName: "", isGeneralShared: false })).toBe("Unassigned");
    expect(designation({ departmentId: "", departmentName: "", isGeneralShared: true })).toBe("General / Shared");
  });

  it("allows every level in General / Shared rooms, ignoring legacy program restrictions", () => {
    for (const level of ["COLLEGE", "SENIOR_HIGH", "JUNIOR_HIGH", "ELEMENTARY", "PRE_ELEMENTARY"]) {
      expect(roomAllowsSection({ departmentId: null, isGeneralShared: true, programIds: ["old"] }, { level, departmentId: "any" })).toBe(true);
    }
    expect(designation({ departmentId: "", departmentName: "" })).toBe("General / Shared");
  });

  it.each(["CAS", "CBA", "CCJE", "CHTM", "COICS", "CTE"])("designates a %s room for every program in that college", (code) => {
    const room = { departmentId: code, departmentCode: code, programIds: [] };
    expect(roomAllowsSection(room, { departmentId: code, programId: "first-program", level: "COLLEGE" })).toBe(true);
    expect(roomAllowsSection(room, { departmentId: code, programId: "another-program", level: "COLLEGE" })).toBe(true);
    expect(roomAllowsSection(room, { departmentId: "other-college", level: "COLLEGE" })).toBe(false);
  });

  it.each([
    ["SHS", "SENIOR_HIGH"], ["JHS", "JUNIOR_HIGH"], ["ELEM", "ELEMENTARY"], ["PRE-ELEM", "PRE_ELEMENTARY"],
  ])("supports %s sections without requiring a program or rewriting historical BED ownership", (code, level) => {
    const room = { departmentId: code, departmentCode: code, programIds: [] };
    expect(roomAllowsSection(room, { departmentId: "BED", programId: null, level })).toBe(true);
    expect(roomAllowsSection(room, { departmentId: "BED", level: "COLLEGE" })).toBe(false);
    expect(roomAllowsSection(room, { departmentId: "BED", level: level === "ELEMENTARY" ? "PRE_ELEMENTARY" : "ELEMENTARY" })).toBe(false);
  });

  it("uses the owning department in reports even if no programs were selected", () => {
    expect(designation({ departmentId: "coics", departmentName: "College of Informatics and Computing Sciences" })).toBe("College of Informatics and Computing Sciences");
  });

  it("blocks a mismatched department even when the old shared flag is true", () => {
    const ctx: ConstraintContext = {
      rooms: new Map([["room", { name: "Room 101", capacity: 40, departmentId: "coics", isGeneralShared: true, programIds: [] }]]),
      sections: new Map([["section", { name: "Business", studentCount: 30, departmentId: "cba", programId: "bsba", level: "COLLEGE" }]]),
      faculty: new Map(), subjects: new Map(), programNames: new Map(),
    };
    const rules = [{ id: "designation", name: "Designation", kind: "ROOM_DESIGNATION" as const, params: {}, departmentId: null }];
    expect(checkEntry(entry, [], rules, ctx)).toMatchObject([{ hard: true, kind: "ROOM_DESIGNATION" }]);
  });

  it("ranks the department's room ahead of a smaller room belonging to another college", () => {
    const rooms = [
      { id: "wrong", capacity: 30, roomType: "LECTURE_ROOM" as const, status: "AVAILABLE", departmentId: "cba" },
      { id: "own", capacity: 40, roomType: "LECTURE_ROOM" as const, status: "AVAILABLE", departmentId: "coics" },
    ];
    expect(rankRooms(rooms, entry, [], { component: "LECTURE", studentCount: 30, departmentId: "coics", level: "COLLEGE" })[0].id).toBe("own");
  });
});
