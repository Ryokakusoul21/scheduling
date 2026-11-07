import type { DayOfWeek, RoomType } from "@/lib/scheduler/types";
import type { ConstraintRule } from "@/lib/scheduler/constraints";

export type ScheduleStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";

export interface SchedulerEntry {
  id: string;
  semesterId: string;
  sectionId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  component: "LECTURE" | "LABORATORY";
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
  status: ScheduleStatus;
  notes: string | null;
  /** Protected from urgent room bookings unless the Registrar confirms. */
  doNotMove?: boolean;
  /** Another department's class: only its time, room, and faculty are known; used for conflict checks only. */
  busy?: boolean;
}

export interface TermOption {
  id: string;
  academicYearId: string;
  level: string;
  programId: string | null;
  type: string;
  label: string;
  isActive: boolean;
  start: number;
  end: number;
}

export interface ProgramOption {
  id: string;
  code: string;
  name: string;
  level: string;
  departmentId: string | null;
}

export interface DepartmentOption {
  id: string;
  code: string;
  name: string;
}

export interface SectionOption {
  id: string;
  name: string;
  level: string;
  programId: string | null;
  yearLevel: string | null;
  gradeLevel: string | null;
  semesterId: string | null;
  studentCount: number;
  /** Approved curriculum components that may enter the unscheduled queue. */
  curriculum: { subjectId: string; component: "LECTURE" | "LABORATORY" }[];
  /** Archived records stay for showing existing classes but are never offered for new ones. */
  archived: boolean;
  departmentId: string | null;
  /** Program code and section, e.g. "BSIT 1-A". */
  shortName: string;
  /** Whether the viewer may change this section's classes. */
  editable: boolean;
}

export interface SubjectOption {
  id: string;
  code: string;
  name: string;
  level: string;
  programId: string | null;
  yearLevel: string | null;
  gradeLevel: string | null;
  lectureHours: number;
  labHours: number;
  units: number;
  requiredRoomType: RoomType;
  archived: boolean;
}

export interface Availability {
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

export interface FacultyOption {
  id: string;
  fullName: string;
  maxHours: number;
  dayOff?: string | null;
  departmentId: string | null;
  teachingLevels: string[];
  status: string;
  availability: Availability[];
  /** Belongs to another department: shown as free or busy, and choosing it sends a request for approval. */
  foreign?: boolean;
}

export interface RoomOption {
  id: string;
  roomNumber: string;
  roomName: string;
  capacity: number;
  roomType: RoomType;
  status: "AVAILABLE" | "UNDER_MAINTENANCE" | "UNAVAILABLE";
  location: string;
  availability: Availability[];
  /** Designated programs and strands; null means General / Shared. */
  programIds: string[] | null;
  archived: boolean;
  /** Owned by another department: shown as free or busy, and choosing it sends a request for approval. */
  foreign?: boolean;
}

export interface SchedulerData {
  academicYears: { id: string; name: string; isActive: boolean }[];
  academicYearId: string | null;
  terms: TermOption[];
  departments: DepartmentOption[];
  programs: ProgramOption[];
  sections: SectionOption[];
  subjects: SubjectOption[];
  faculty: FacultyOption[];
  /** Other departments' faculty teaching visible classes: display name only, never selectable. */
  outsideFaculty: { id: string; fullName: string; department: string }[];
  rooms: RoomOption[];
  entries: SchedulerEntry[];
  /** Anonymous busy blocks of other departments' classes (Head of Department only). */
  busy: SchedulerEntry[];
  /** Enabled constraint rules that apply to the viewer's classes, for Resolve issues. */
  rules: ConstraintRule[];
  /** Active subject assignments for the visible sections; the scheduler offers the assigned faculty first. */
  assignments: { subjectId: string; sectionId: string | null; facultyId: string }[];
  /** Current teaching load of each listed faculty member in the active terms, for projected-load warnings. */
  workload: { measure: "HOURS" | "UNITS"; loads: { facultyId: string; name: string; load: number; minimum: number; maximum: number }[] };
}

export interface SchedulerPermissions {
  canEdit: boolean;
  canPublish: boolean;
  canSubmit: boolean;
  directEdit: boolean;
  /** New classes must originate from an approved curriculum queue item. */
  queueOnly: boolean;
  /** The only academic level this role may browse. */
  lockedLevel: string | null;
  /** Faculty users see their own classes by default. */
  ownFacultyId: string | null;
}
