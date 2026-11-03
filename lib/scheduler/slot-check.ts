/**
 * Slot validation for placing one class: why a day and time is invalid, and which rooms would fit.
 * Pure and browser-safe; callers pass only classes from concurrent terms.
 */
import { rangesOverlap, type DayOfWeek, type RoomType, type SchedEntry, type SchedFaculty, type SchedRoom, type TimeRange } from "./types";

export type SlotReason = "Faculty busy" | "Room busy" | "Section busy" | "Room type mismatch" | "Faculty unavailable" | "Outside allowed hours";

export interface SlotStatus extends TimeRange {
  reasons: SlotReason[];
}

const LAB_TYPES: RoomType[] = ["COMPUTER_LABORATORY", "SCIENCE_LABORATORY"];

export const isLabRoom = (type: RoomType) => LAB_TYPES.includes(type);

function inside(e: SchedEntry, windows: { dayOfWeek: DayOfWeek; startMin: number; endMin: number }[]) {
  return windows.some((w) => w.dayOfWeek === e.dayOfWeek && e.startMin >= w.startMin && e.endMin <= w.endMin);
}

/** Every reason the candidate cannot take its slot; an empty list means the slot is valid. */
export function checkSlot(
  c: SchedEntry,
  others: SchedEntry[],
  ctx: { faculty?: SchedFaculty; room?: SchedRoom; bounds: TimeRange }
): SlotReason[] {
  const reasons = new Set<SlotReason>();
  for (const o of others) {
    if (o === c || (c.id && o.id === c.id) || o.dayOfWeek !== c.dayOfWeek || !rangesOverlap(o, c)) continue;
    if (c.facultyId && o.facultyId === c.facultyId) reasons.add("Faculty busy");
    if (c.roomId && o.roomId === c.roomId) reasons.add("Room busy");
    if (o.sectionId === c.sectionId) reasons.add("Section busy");
  }
  if (ctx.room && c.component === "LABORATORY" && !isLabRoom(ctx.room.roomType)) reasons.add("Room type mismatch");
  const f = ctx.faculty;
  if (f && (f.dayOff === c.dayOfWeek || (f.availability.length > 0 && !inside(c, f.availability)))) reasons.add("Faculty unavailable");
  const r = ctx.room;
  if (c.startMin < ctx.bounds.startMin || c.endMin > ctx.bounds.endMin || (r && r.availability.length > 0 && !inside(c, r.availability))) {
    reasons.add("Outside allowed hours");
  }
  return [...reasons];
}

/** Status of every slot start on each day for a class of the given duration. */
export function slotMap(
  days: DayOfWeek[],
  bounds: TimeRange,
  step: number,
  duration: number,
  check: (day: DayOfWeek, startMin: number, endMin: number) => SlotReason[]
): Map<DayOfWeek, SlotStatus[]> {
  const out = new Map<DayOfWeek, SlotStatus[]>();
  for (const day of days) {
    const list: SlotStatus[] = [];
    for (let s = bounds.startMin; s + duration <= bounds.endMin; s += step) list.push({ startMin: s, endMin: s + duration, reasons: check(day, s, s + duration) });
    out.set(day, list);
  }
  return out;
}

/** Rooms of the right type, free at the class time, with enough seats; smallest fitting room first. */
export function suggestRooms<R extends SchedRoom & { archived?: boolean; foreign?: boolean }>(
  entry: SchedEntry,
  rooms: R[],
  others: SchedEntry[],
  needs: { studentCount: number; requiredRoomType?: RoomType }
): R[] {
  const wantLab = entry.component === "LABORATORY";
  const exact = wantLab && needs.requiredRoomType && isLabRoom(needs.requiredRoomType) ? needs.requiredRoomType : null;
  return rooms
    .filter((r) => !r.archived && !r.foreign && r.status === "AVAILABLE" && r.id !== entry.roomId)
    .filter((r) => (exact ? r.roomType === exact : wantLab ? isLabRoom(r.roomType) : !isLabRoom(r.roomType)))
    .filter((r) => r.capacity >= needs.studentCount)
    .filter((r) => !checkSlot({ ...entry, roomId: r.id }, others, { room: r, bounds: { startMin: 0, endMin: 24 * 60 } }).some((x) => x === "Room busy" || x === "Outside allowed hours"))
    .sort((a, b) => a.capacity - b.capacity);
}
