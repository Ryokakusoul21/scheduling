/** Shapes shared by the issue resolver: its input world, options, changes, and proposal. Browser-safe. */
import type { ConstraintContext, ConstraintRule } from "../constraints";
import type { DayOfWeek, RoomType, SchedFaculty, SchedRoom, TimeRange } from "../types";

export type IssueKind = "UNSCHEDULED" | "HOURS" | "ROOM_TYPE" | "CONFLICT";
export const ISSUE_KINDS: IssueKind[] = ["UNSCHEDULED", "HOURS", "ROOM_TYPE", "CONFLICT"];

export interface ResolverEntry {
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
  status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
  /** Another department's class: blocks time but is never changed or named. */
  busy?: boolean;
}

export interface ResolverSection {
  id: string;
  name: string;
  level: string;
  programId: string | null;
  departmentId: string | null;
  termId: string;
  studentCount: number;
  /** Approved curriculum components with the weekly minutes each requires. */
  curriculum: { subjectId: string; component: "LECTURE" | "LABORATORY"; requiredMin: number }[];
  /** False for sections the viewer may see but not change. */
  editable: boolean;
}

export interface ResolverSubject {
  id: string;
  code: string;
  name: string;
  lectureHours: number;
  labHours: number;
  requiredRoomType: RoomType;
}

export interface ResolverFaculty extends SchedFaculty {
  teachingLevels: string[];
  /** Only active faculty of the viewer's own scope are ever assigned. */
  assignable: boolean;
}

export interface ResolverRoom extends SchedRoom {
  programIds: string[] | null;
  /** Rooms of another department or closed rooms are never chosen. */
  assignable: boolean;
}

export interface ResolverInput {
  entries: ResolverEntry[];
  sections: ResolverSection[];
  subjects: ResolverSubject[];
  faculty: ResolverFaculty[];
  rooms: ResolverRoom[];
  rules: ConstraintRule[];
  ruleCtx: ConstraintContext;
  termRanges: Map<string, { start: number; end: number }>;
  bounds: TimeRange;
  /** Grid step for start times, in minutes. */
  step: number;
}

export interface ResolverOptions {
  /** Sections to work on; issues elsewhere are left alone. */
  sectionIds: string[];
  /** When set, only these issue ids are worked on ("This issue only"). */
  issueIds?: string[];
  kinds: IssueKind[];
  keepFaculty: boolean;
  /** Allow moving classes of sections whose hours are already complete. */
  moveCompleteSections: boolean;
  /** Allow changing the day or time of classes already on the timetable. */
  retime: boolean;
  timeLimitMs: number;
  maxIterations: number;
}

export const DEFAULT_OPTIONS: Omit<ResolverOptions, "sectionIds"> = {
  kinds: ISSUE_KINDS,
  keepFaculty: true,
  moveCompleteSections: false,
  retime: true,
  timeLimitMs: 8000,
  maxIterations: 20000,
};

export interface Issue {
  id: string;
  kind: IssueKind;
  sectionId: string;
  subjectId?: string;
  component?: "LECTURE" | "LABORATORY";
  entryIds: string[];
  description: string;
  /** Hours far beyond the requirement look like a subject setup problem, not something to trim. */
  dataProblem?: boolean;
}

export type ChangeType = "PLACED" | "MOVED" | "ROOM_CHANGED" | "TIME_CHANGED" | "HOURS_ADJUSTED" | "REMOVED";

export interface Change {
  id: string;
  type: ChangeType;
  /** Issue this change resolves; a displaced class shares the group of the change that needed its slot. */
  issueId: string;
  group: string;
  sectionId: string;
  before: ResolverEntry | null;
  after: ResolverEntry | null;
  reason: string;
}

export interface Unresolved {
  issue: Issue;
  reason: string;
  /** Concrete things a person can do, written from templates or by the language model. */
  actions: string[];
  link?: { href: string; label: string };
}

export interface IssueCounts {
  unscheduled: number;
  warnings: number;
  conflicts: number;
}

export interface Proposal {
  changes: Change[];
  unresolved: Unresolved[];
  before: IssueCounts;
  after: IssueCounts;
  classesMoved: number;
  facultyAffected: number;
  softViolations: number;
  /** True when the time or iteration limit stopped the search; the best partial result is returned. */
  stoppedEarly: boolean;
  iterations: number;
}

export type ProgressStep = "Finding issues" | "Adjusting hours" | "Placing laboratory classes" | "Placing lecture classes" | "Fixing room types" | "Resolving conflicts" | "Improving the proposal" | "Done";
