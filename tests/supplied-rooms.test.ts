import { describe, expect, it } from "vitest";
import { SUPPLIED_ROOM_BUILDINGS, suppliedRoomName, validateRoomCapacities } from "@/prisma/supplied-rooms";

const rooms = SUPPLIED_ROOM_BUILDINGS.flatMap((building) => building.rooms);

describe("supplied building room lists", () => {
  it("matches each image's room count with unique room numbers", () => {
    expect(SUPPLIED_ROOM_BUILDINGS.map((building) => building.rooms.length)).toEqual([11, 6, 20, 19]);
    expect(rooms).toHaveLength(56);
    expect(new Set(rooms.map((room) => room.number)).size).toBe(56);
  });
  it("retains GC-201 on the first floor as explicitly listed", () => {
    expect(rooms.find((room) => room.number === "GC-201")).toMatchObject({ floor: 1, owner: "ELEM" });
  });
  it("keeps blank owners unassigned and preserves faculty and basic-education distinctions", () => {
    expect(rooms.filter((room) => !room.owner).map((room) => room.number)).toEqual(["GA-302", "GA-304", "GD-201"]);
    expect(suppliedRoomName(rooms.find((room) => room.number === "GC-303")!)).toBe("Classroom (Faculty)");
    expect(suppliedRoomName(rooms.find((room) => room.number === "GC-103")!)).toBe("Classroom (Pre-elementary)");
    expect(rooms.find((room) => room.number === "GA-310")?.type).toBe("COMPUTER_LABORATORY");
    expect(rooms.find((room) => room.number === "GC-203")?.type).toBe("COMPUTER_LABORATORY");
    expect(rooms.find((room) => room.number === "GD-201")).toMatchObject({ designation: "Speech laboratory", type: "OTHER" });
  });
  it("refuses missing, unknown, or invalid capacities instead of guessing", () => {
    const capacities = Object.fromEntries(rooms.map((room) => [room.number, 40]));
    expect(() => validateRoomCapacities(capacities)).not.toThrow();
    expect(() => validateRoomCapacities({})).toThrow("capacities still needed");
    expect(() => validateRoomCapacities({ ...capacities, "GA-999": 40 })).toThrow("Unknown room");
    for (const invalid of [-1, 2.5, 1001, NaN]) expect(() => validateRoomCapacities({ ...capacities, "GA-302": invalid })).toThrow("GA-302");
  });
});
