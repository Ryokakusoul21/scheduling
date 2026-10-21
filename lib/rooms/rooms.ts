/** Room, floor, and building shapes plus labels shared by the Rooms pages (browser-safe). */

export interface Room {
  id: string;
  floorId: string;
  roomNumber: string;
  roomName: string;
  capacity: number;
  roomType: string;
  status: string;
  equipment: string;
  utilization: number;
  departmentId: string;
  /** Designated programs and strands; empty means General / Shared. */
  programIds: string[];
}
export interface Floor {
  id: string;
  buildingId: string;
  name: string;
  number: number;
  rooms: Room[];
}
export interface Building {
  id: string;
  name: string;
  code: string;
  description: string;
  floors: Floor[];
}

export const ROOM_TYPES = [
  { value: "LECTURE_ROOM", label: "Lecture room / classroom" },
  { value: "COMPUTER_LABORATORY", label: "Computer laboratory" },
  { value: "SCIENCE_LABORATORY", label: "Science laboratory" },
  { value: "CONFERENCE_ROOM", label: "Conference room" },
  { value: "OTHER", label: "Other" },
];
export const STATUSES = [
  { value: "AVAILABLE", label: "Available" },
  { value: "UNDER_MAINTENANCE", label: "Under maintenance" },
  { value: "UNAVAILABLE", label: "Unavailable" },
];

export type Option = { value: string; label: string };

/** Filter and checkbox value meaning "General / Shared". */
export const GENERAL = "GENERAL";

/** Short program codes a room is designated for, or "General / Shared". */
export function designation(r: Room, programs: Option[]) {
  if (!r.programIds.length) return "General / Shared";
  return r.programIds.map((id) => programs.find((p) => p.value === id)?.label.split(" - ")[0] ?? "Unknown").join(", ");
}
