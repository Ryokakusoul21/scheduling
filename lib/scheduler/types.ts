export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type RoomType =
  | "LECTURE_ROOM"
  | "COMPUTER_LABORATORY"
  | "SCIENCE_LABORATORY"
  | "CONFERENCE_ROOM"
  | "OTHER";

export type SubjectComponent = "LECTURE" | "LABORATORY";

export const DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

/** A single time interval expressed in minutes-from-midnight for cheap comparison. */
export interface TimeRange {
  startMin: number;
  endMin: number;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/** A subject definition used by the scheduling engine. */
export interface SchedSubject {
  id: string;
  code: string;
  name: string;
  lectureHours: number;
  labHours: number;
  requiredRoomType: RoomType;
}

export interface SchedSection {
  id: string;
  name: string;
  studentCount: number;
}

export interface SchedFacultyAvailability {
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export interface SchedFaculty {
  id: string;
  fullName: string;
  maxHours: number;
  specialization?: string | null;
  availability: SchedFacultyAvailability[];
  /** hours already assigned in the semester being scheduled, for workload balancing */
  assignedHours: number;
}

export interface SchedRoomAvailability {
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export interface SchedRoom {
  id: string;
  roomNumber: string;
  roomName: string;
  capacity: number;
  roomType: RoomType;
  availability: SchedRoomAvailability[];
  status: "AVAILABLE" | "UNDER_MAINTENANCE" | "UNAVAILABLE";
}

/** A placed (or candidate) class meeting. */
export interface SchedEntry {
  id?: string;
  /** Term (semester/quarter) the entry belongs to; used to skip pairs from non-overlapping terms. */
  semesterId?: string;
  subjectId: string;
  sectionId: string;
  facultyId: string;
  roomId: string;
  component: SubjectComponent;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export type ConflictType =
  | "FACULTY_CONFLICT"
  | "ROOM_CONFLICT"
  | "SECTION_CONFLICT"
  | "CAPACITY_CONFLICT"
  | "AVAILABILITY_CONFLICT"
  | "SUBJECT_REQUIREMENT_CONFLICT";

export type ConflictSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface DetectedConflict {
  type: ConflictType;
  severity: ConflictSeverity;
  description: string;
  entryA: SchedEntry;
  entryB?: SchedEntry;
}
