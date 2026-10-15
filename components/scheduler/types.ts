import type { DayOfWeek, RoomType } from "@/lib/scheduler/types";

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
  requiredRoomType: RoomType;
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
  departmentId: string | null;
  teachingLevels: string[];
  status: string;
  availability: Availability[];
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
  rooms: RoomOption[];
  entries: SchedulerEntry[];
}

export interface SchedulerPermissions {
  canEdit: boolean;
  canPublish: boolean;
  directEdit: boolean;
  /** Faculty users see their own classes by default. */
  ownFacultyId: string | null;
}
