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
  departmentName: string;
  isGeneralShared: boolean;
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

/** Filter value meaning "General / Shared". */
export const GENERAL = "GENERAL";
export const UNASSIGNED = "UNASSIGNED";

/** Department designation used by the room form, cards, and reports. */
export function designation(r: Pick<Room, "departmentId" | "departmentName"> & { isGeneralShared?: boolean }) {
  if (r.departmentId) return r.departmentName || "Unknown department";
  return r.isGeneralShared === false ? "Unassigned" : "General / Shared";
}
