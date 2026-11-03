import { describe, expect, it } from "vitest";
import { checkSlot, slotMap, suggestRooms } from "@/lib/scheduler/slot-check";
import { durationMismatches } from "@/lib/scheduler/summary";
import type { SchedEntry, SchedRoom } from "@/lib/scheduler/types";

const bounds = { startMin: 7 * 60, endMin: 18 * 60 };
const e = (over: Partial<SchedEntry> = {}): SchedEntry => ({
  id: "c", semesterId: "t1", sectionId: "s1", subjectId: "it101", facultyId: "f1", roomId: "r1",
  component: "LECTURE", dayOfWeek: "MONDAY", startMin: 480, endMin: 540, ...over,
});
const room = (over: Partial<SchedRoom> = {}): SchedRoom => ({
  id: "r1", roomNumber: "101", roomName: "Room 101", capacity: 40, roomType: "LECTURE_ROOM", availability: [], status: "AVAILABLE", ...over,
});

describe("checkSlot", () => {
  it("reports each busy resource on overlap", () => {
    const other = e({ id: "o", sectionId: "s1", facultyId: "f1", roomId: "r1" });
    expect(checkSlot(e(), [other], { bounds }).sort()).toEqual(["Faculty busy", "Room busy", "Section busy"]);
  });

  it("ignores the class itself and other days", () => {
    expect(checkSlot(e(), [e(), e({ id: "o", dayOfWeek: "TUESDAY" })], { bounds })).toEqual([]);
  });

  it("flags a laboratory in a lecture room, faculty day off, and hours outside bounds", () => {
    const faculty = { id: "f1", fullName: "A", maxHours: 24, dayOff: "MONDAY" as const, availability: [], assignedHours: 0 };
    const reasons = checkSlot(e({ component: "LABORATORY", startMin: 17 * 60, endMin: 19 * 60 }), [], { faculty, room: room(), bounds });
    expect(reasons.sort()).toEqual(["Faculty unavailable", "Outside allowed hours", "Room type mismatch"]);
  });

  it("maps every slot start of a day", () => {
    const map = slotMap(["MONDAY"], { startMin: 480, endMin: 600 }, 30, 60, (_d, s) => (s === 480 ? ["Room busy"] : []));
    expect(map.get("MONDAY")?.map((x) => [x.startMin, x.reasons.length])).toEqual([[480, 1], [510, 0], [540, 0]]);
  });
});

describe("suggestRooms", () => {
  it("returns free laboratories of the required type with enough seats, smallest first", () => {
    const rooms = [
      room({ id: "lec", roomType: "LECTURE_ROOM" }),
      room({ id: "big", roomType: "COMPUTER_LABORATORY", capacity: 60 }),
      room({ id: "small", roomType: "COMPUTER_LABORATORY", capacity: 35 }),
      room({ id: "tiny", roomType: "COMPUTER_LABORATORY", capacity: 10 }),
      room({ id: "busy", roomType: "COMPUTER_LABORATORY", capacity: 40 }),
      room({ id: "sci", roomType: "SCIENCE_LABORATORY" }),
    ];
    const lab = e({ component: "LABORATORY", roomId: "lec" });
    const found = suggestRooms(lab, rooms, [e({ id: "o", sectionId: "s2", facultyId: "f2", roomId: "busy" })], { studentCount: 30, requiredRoomType: "COMPUTER_LABORATORY" });
    expect(found.map((r) => r.id)).toEqual(["small", "big"]);
  });
});

describe("durationMismatches", () => {
  const subjects = new Map([["it101", { code: "IT101", lectureHours: 2, labHours: 3 }]]);
  it("flags a section whose laboratory hours differ from the subject", () => {
    const found = durationMismatches([e({ component: "LABORATORY", startMin: 480, endMin: 540 })], subjects);
    expect(found).toHaveLength(1);
    expect(found[0].description).toContain("1 of 3 required hours");
  });
  it("accepts hours split across meetings", () => {
    expect(durationMismatches([e({ id: "a" }), e({ id: "b", dayOfWeek: "WEDNESDAY" })], subjects)).toEqual([]);
  });
});
