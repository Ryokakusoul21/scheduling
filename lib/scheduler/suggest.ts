import { roomAllowsSection, type RoomDesignation, type SectionDesignation } from "@/lib/rooms/designation";
/**
 * Ranks faculty and rooms for a class slot so the best (free, available,
 * suitable) options come first. Shared by the class dialog and drag-to-create.
 */
import { rangesOverlap, type DayOfWeek, type RoomType } from "./types";

interface Slot {
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

interface Booking extends Slot {
  facultyId: string;
  roomId: string;
}

interface Window {
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export interface Ranked {
  id: string;
  rank: number; // lower is better; 0 = perfect fit
  notes: string[];
}

function isBusy(bookings: Booking[], key: "facultyId" | "roomId", id: string, slot: Slot) {
  return bookings.some((b) => b[key] === id && b.dayOfWeek === slot.dayOfWeek && rangesOverlap(b, slot));
}

function withinAvailability(windows: Window[], slot: Slot) {
  return (
    windows.length === 0 ||
    windows.some((w) => w.dayOfWeek === slot.dayOfWeek && slot.startMin >= w.startMin && slot.endMin <= w.endMin)
  );
}

export function rankFaculty(
  faculty: { id: string; teachingLevels: string[]; availability: Window[]; dayOff?: string | null }[],
  slot: Slot,
  bookings: Booking[],
  level?: string
): Ranked[] {
  return faculty
    .map((f) => {
      const busy = isBusy(bookings, "facultyId", f.id, slot);
      const available = withinAvailability(f.availability, slot) && !(f.dayOff && f.dayOff === (slot as { dayOfWeek?: string }).dayOfWeek);
      const teaches = !level || f.teachingLevels.includes(level);
      return {
        id: f.id,
        rank: (busy ? 4 : 0) + (available ? 0 : 2) + (teaches ? 0 : 1),
        notes: [busy && "busy", !available && "unavailable", !teaches && "other level"].filter(Boolean) as string[],
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

const LAB_TYPES: RoomType[] = ["COMPUTER_LABORATORY", "SCIENCE_LABORATORY"];

export function rankRooms(
  rooms: ({ id: string; capacity: number; roomType: RoomType; status: string } & RoomDesignation)[],
  slot: Slot,
  bookings: Booking[],
  /** The faculty member's preferred rooms, best first: a free valid preferred room wins; otherwise the tightest fit. */
  opts: SectionDesignation & { studentCount?: number; component: "LECTURE" | "LABORATORY"; requiredRoomType?: RoomType; programId?: string | null; preferredRoomIds?: string[]; sameRoomId?: string }
): Ranked[] {
  const capacity = new Map(rooms.map((r) => [r.id, r.capacity]));
  return rooms
    .map((r) => {
      const busy = isBusy(bookings, "roomId", r.id, slot);
      const tooSmall = opts.studentCount !== undefined && opts.studentCount > r.capacity;
      const isLab = LAB_TYPES.includes(r.roomType);
      const typeMismatch =
        opts.component === "LABORATORY"
          ? !isLab && r.roomType !== opts.requiredRoomType
          : isLab || r.roomType === "CONFERENCE_ROOM";
      const closed = r.status !== "AVAILABLE";
      // Designation and owning department use the same selection.
      const otherProgram = !roomAllowsSection(r, opts);
      const base = (busy ? 8 : 0) + (closed || otherProgram ? 4 : 0) + (tooSmall ? 2 : 0) + (typeMismatch ? 1 : 0);
      const preferred = opts.preferredRoomIds?.indexOf(r.id) ?? -1;
      // Only a room that is otherwise valid gets the preference boost; a busy preferred room falls back.
      // Next best: the room the subject's other meetings with this section already use.
      const boost = base !== 0 ? 0 : preferred >= 0 ? 1 - preferred * 0.1 : r.id === opts.sameRoomId ? 0.5 : 0;
      return {
        id: r.id,
        rank: base - boost,
        notes: [busy && "busy", tooSmall && `seats ${r.capacity}`, typeMismatch && "type", closed && "closed", otherProgram && "other department", boost > 0 && (preferred >= 0 ? "preferred" : "same room")].filter(Boolean) as string[],
      };
    })
    .sort((a, b) => a.rank - b.rank || (capacity.get(a.id) ?? 0) - (capacity.get(b.id) ?? 0));
}
