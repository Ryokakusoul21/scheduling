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
  subjectId: string;
  sectionId: string;
  facultyId: string;
  roomId: string;
  component: SubjectComponent;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export interface GenerationRequest {
  semesterId: string;
  sectionIds: string[];
  /** subjectId -> facultyId, optional pinning. If absent, engine chooses best faculty. */
  facultyOverrides?: Record<string, string>;
  constraints?: SchedulingConstraints;
}

export interface SchedulingConstraints {
  dayStartMin: number; // e.g. 7:00 -> 420
  dayEndMin: number; // e.g. 19:00 -> 1140
  allowedDays: DayOfWeek[];
  avoidBefore?: number; // soft: avoid classes before this minute
  avoidAfter?: number; // soft: avoid classes after this minute
  preferConsecutive?: boolean;
  maxClassesPerDayPerSection?: number;
  slotGranularityMin: number; // e.g. 30
}

export const DEFAULT_CONSTRAINTS: SchedulingConstraints = {
  dayStartMin: toMinutes("07:00"),
  dayEndMin: toMinutes("19:00"),
  allowedDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
  avoidBefore: toMinutes("08:00"),
  avoidAfter: toMinutes("18:00"),
  preferConsecutive: true,
  maxClassesPerDayPerSection: 4,
  slotGranularityMin: 30,
};

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

export interface ScoreBreakdown {
  facultyWorkloadBalance: number; // 0-100
  roomUtilization: number; // 0-100
  studentScheduleQuality: number; // 0-100
  constraintSatisfaction: number; // 0-100
  overallScore: number; // 0-100
}
