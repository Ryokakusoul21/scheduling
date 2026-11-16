import type { RoomType } from "@prisma/client";

export type RoomOwner = "IT" | "BSTM" | "EDUC" | "ELEM" | "NKP" | "JUNIOR_HS" | "BSBA" | "BSCRIM" | "FACULTY";
export type SuppliedRoom = { number: string; floor: number; designation: string; owner: RoomOwner | null; type: RoomType };
type RoomRow = readonly [number: string, floor: number, designation: string, owner: RoomOwner | null, type?: RoomType];

const rooms = (rows: readonly RoomRow[]): SuppliedRoom[] => rows.map(([number, floor, designation, owner, type = "LECTURE_ROOM"]) => ({ number, floor, designation, owner, type }));

/** Room numbers and floor assignments transcribed from rooms_A.png through rooms_D.png. */
export const SUPPLIED_ROOM_BUILDINGS = [
  { code: "A", name: "Building A", rooms: rooms([
    ["GA-302", 3, "Biology laboratory", null, "SCIENCE_LABORATORY"],
    ["GA-303", 3, "Lecture room", "IT"],
    ["GA-304", 3, "Chemistry laboratory", null, "SCIENCE_LABORATORY"],
    ["GA-309", 3, "Lecture room", "IT"],
    ["GA-310", 3, "Computer laboratory 1", "IT", "COMPUTER_LABORATORY"],
    ["GA-401", 4, "Lecture room", "IT"],
    ["GA-402", 4, "Lecture room", "BSTM"],
    ["GA-403", 4, "Lecture room", "IT"],
    ["GA-404", 4, "Lecture room", "IT"],
    ["GA-407", 4, "Lecture room", "IT"],
    ["GA-408", 4, "Lecture room", "EDUC"],
  ]) },
  { code: "B", name: "Building B", rooms: rooms([
    ["GB-201", 2, "Lecture room", "BSTM"],
    ["GB-202", 2, "Lecture room", "BSTM"],
    ["GB-301", 3, "Lecture room", "BSTM"],
    ["GB-302", 3, "Lecture room", "BSTM"],
    ["GB-401", 4, "Lecture room", "BSTM"],
    ["GB-402", 4, "Lecture room", "BSTM"],
  ]) },
  { code: "C", name: "Building C", rooms: rooms([
    ["GC-101", 1, "Classroom", "ELEM"],
    ["GC-102", 1, "Lecture room", "IT"],
    ["GC-103", 1, "Classroom", "NKP"],
    ["GC-106", 1, "Classroom", "ELEM"],
    ["GC-107", 1, "Lecture room", "BSTM"],
    ["GC-201", 1, "Classroom", "ELEM"],
    ["GC-202", 2, "Classroom", "JUNIOR_HS"],
    ["GC-203", 2, "Computer laboratory 2", "JUNIOR_HS", "COMPUTER_LABORATORY"],
    ["GC-206", 2, "Classroom", "JUNIOR_HS"],
    ["GC-207", 2, "Classroom", "JUNIOR_HS"],
    ["GC-301", 3, "Classroom", "EDUC"],
    ["GC-302", 3, "Lecture room", "JUNIOR_HS"],
    ["GC-303", 3, "Classroom", "FACULTY"],
    ["GC-306", 3, "Classroom", "JUNIOR_HS"],
    ["GC-307", 3, "Classroom", "BSBA"],
    ["GC-401", 4, "Lecture room", "BSBA"],
    ["GC-402", 4, "Lecture room", "BSBA"],
    ["GC-403", 4, "Lecture room", "FACULTY"],
    ["GC-406", 4, "Lecture room", "EDUC"],
    ["GC-407", 4, "Lecture room", "EDUC"],
  ]) },
  { code: "D", name: "Building D", rooms: rooms([
    ["GD-101", 1, "Lecture room", "BSCRIM"],
    ["GD-105", 1, "Lecture room", "BSCRIM"],
    ["GD-201", 2, "Speech laboratory", null, "OTHER"],
    ["GD-202", 2, "Lecture room", "BSCRIM"],
    ["GD-205", 2, "Lecture room", "BSCRIM"],
    ["GD-206", 2, "Lecture room", "BSCRIM"],
    ["GD-207", 2, "Lecture room", "BSCRIM"],
    ["GD-208", 2, "Lecture room", "BSCRIM"],
    ["GD-301", 3, "Lecture room", "BSCRIM"],
    ["GD-302", 3, "Lecture room", "BSCRIM"],
    ["GD-305", 3, "Lecture room", "BSCRIM"],
    ["GD-306", 3, "Lecture room", "BSCRIM"],
    ["GD-307", 3, "Lecture room", "BSCRIM"],
    ["GD-401", 4, "Lecture room", "BSCRIM"],
    ["GD-402", 4, "Lecture room", "BSCRIM"],
    ["GD-403", 4, "Lecture room", "BSCRIM"],
    ["GD-405", 4, "Lecture room", "BSCRIM"],
    ["GD-406", 4, "Lecture room", "BSCRIM"],
    ["GD-407", 4, "Lecture room", "BSCRIM"],
  ]) },
];

/** Confirmed capacities only; missing rooms cannot be imported until their capacities are supplied. */
export const SUPPLIED_ROOM_CAPACITIES: Record<string, number> = {};

export function validateRoomCapacities(capacities: Record<string, number>) {
  const numbers = new Set(SUPPLIED_ROOM_BUILDINGS.flatMap((building) => building.rooms.map((room) => room.number)));
  const unknown = Object.keys(capacities).filter((number) => !numbers.has(number));
  if (unknown.length) throw new Error(`Unknown room numbers: ${unknown.join(", ")}.`);
  const missing = [...numbers].filter((number) => !Object.hasOwn(capacities, number));
  if (missing.length) throw new Error(`Room capacities still needed: ${missing.join(", ")}.`);
  for (const [number, capacity] of Object.entries(capacities)) {
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) throw new Error(`Enter a capacity from 0 to 1000 for ${number}.`);
  }
}

/** Keep the source's basic-education and faculty distinctions within the existing department model. */
export function suppliedRoomName(room: SuppliedRoom) {
  const detail = ({ ELEM: "Elementary", NKP: "Pre-elementary", JUNIOR_HS: "Junior High School", FACULTY: "Faculty" } as Partial<Record<RoomOwner, string>>)[room.owner!];
  return detail ? `${room.designation} (${detail})` : room.designation;
}
