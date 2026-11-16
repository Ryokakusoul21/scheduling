import { describe, expect, it } from "vitest";
import { roomLabel } from "@/lib/rooms/label";

describe("room identity labels", () => {
  it("distinguishes rooms that share the same generic name", () => {
    const rooms = ["GA-303", "GA-309", "GA-401"].map((roomNumber) => ({ roomNumber, roomName: "Lecture room" }));
    expect(rooms.map(roomLabel)).toEqual(["GA-303 · Lecture room", "GA-309 · Lecture room", "GA-401 · Lecture room"]);
    expect(new Set(rooms.map(roomLabel)).size).toBe(rooms.length);
  });

  it("preserves descriptive names and avoids repeating an existing code", () => {
    expect(roomLabel({ roomNumber: "GA-310", roomName: "Computer laboratory 1" })).toBe("GA-310 · Computer laboratory 1");
    expect(roomLabel({ roomNumber: "GA-310", roomName: "GA-310" })).toBe("GA-310");
    expect(roomLabel({ roomNumber: "GA-310", roomName: "GA-310 · Computer laboratory 1" })).toBe("GA-310 · Computer laboratory 1");
  });

  it("handles absent names, optional rooms, and existing name-only data", () => {
    expect(roomLabel({ roomNumber: " GA-310 ", roomName: " " })).toBe("GA-310");
    expect(roomLabel({ roomName: "Auditorium" })).toBe("Auditorium");
    expect(roomLabel(null)).toBe("");
    expect(roomLabel(undefined)).toBe("");
  });
});
