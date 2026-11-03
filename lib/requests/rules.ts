import { z } from "zod";

export const REQUEST_TYPES = [
  { value: "NEW_SCHEDULE", label: "New Schedule", needsSchedule: false, hint: "Ask for a class that is not on the timetable yet.", placeholder: "Example: Add a Saturday section of IT101 for working students, 8:00 AM to 11:00 AM." },
  { value: "CHANGE_ROOM", label: "Change Room", needsSchedule: true, hint: "Ask for a different room for an existing class.", placeholder: "Example: Request a room nearer the computer laboratory because the class uses lab machines." },
  { value: "CHANGE_TIME", label: "Change Time", needsSchedule: true, hint: "Ask to move an existing class to another day or time.", placeholder: "Example: Move the class one hour later so students can attend the earlier subject." },
  { value: "CHANGE_FACULTY", label: "Change Faculty", needsSchedule: true, hint: "Ask for a different teacher for an existing class.", placeholder: "Example: The assigned faculty member is on leave this term." },
  { value: "CANCEL_SCHEDULE", label: "Cancel Schedule", needsSchedule: true, hint: "Ask to remove an existing class from the timetable.", placeholder: "Example: The section was merged with another, so this class is no longer needed." },
] as const;

export type FormRequestType = (typeof REQUEST_TYPES)[number]["value"];
export const FORM_TYPE_VALUES = REQUEST_TYPES.map((t) => t.value) as [FormRequestType, ...FormRequestType[]];

/** Every type a row can have, including those filed from other pages. */
export const TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(REQUEST_TYPES.map((t) => [t.value, t.label])),
  CROSS_DEPARTMENT: "Another Department's Resource",
  FACULTY_CHANGE: "Faculty Record Change",
  SUBJECT_CHANGE: "Subject Change",
};

export const STATUS_LABELS: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", COMPLETED: "Approved and applied", CANCELLED: "Cancelled" };
export const STATUS_FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
/** Applied requests count as approved everywhere a person filters or counts. */
export const statusGroup = (status: string): StatusFilter => (status === "COMPLETED" ? "APPROVED" : (status as StatusFilter));

export const DETAILS_MIN = 10;
export const DETAILS_MAX = 500;

const time = z.string().regex(/^\d{2}:\d{2}$/, "Choose a time");
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Shared by the form and the server actions so both validate the same way. */
export const requestFormSchema = z
  .object({
    type: z.enum(FORM_TYPE_VALUES, { message: "Choose a request type" }),
    scheduleId: z.string().optional().transform((v) => v || null),
    reason: z.string().trim().min(DETAILS_MIN, `Describe the request in at least ${DETAILS_MIN} characters`).max(DETAILS_MAX, `Use ${DETAILS_MAX} characters or fewer`),
    requestedRoomId: z.string().optional().transform((v) => v || null),
    requestedDay: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]).optional().or(z.literal("")).transform((v) => v || null),
    requestedStart: time.optional().or(z.literal("")).transform((v) => v || null),
    requestedEnd: time.optional().or(z.literal("")).transform((v) => v || null),
    requestedFacultyId: z.string().optional().transform((v) => v || null),
  })
  .superRefine((d, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const kind = REQUEST_TYPES.find((t) => t.value === d.type);
    if (kind?.needsSchedule && !d.scheduleId) add("scheduleId", "Choose the class this request is about");
    if (d.type === "CHANGE_ROOM" && !d.requestedRoomId) add("requestedRoomId", "Choose the room you want");
    if (d.type === "CHANGE_FACULTY" && !d.requestedFacultyId) add("requestedFacultyId", "Choose the faculty member you want");
    if (d.type === "CHANGE_TIME") {
      if (!d.requestedDay) add("requestedDay", "Choose the day");
      if (!d.requestedStart) add("requestedStart", "Choose a start time");
      if (!d.requestedEnd) add("requestedEnd", "Choose an end time");
      if (d.requestedStart && d.requestedEnd && toMin(d.requestedEnd) <= toMin(d.requestedStart)) add("requestedEnd", "End time must be after the start time");
    }
  });
export type RequestFormInput = z.input<typeof requestFormSchema>;
export type RequestFormData = z.output<typeof requestFormSchema>;

/** What a class looks like now and what the request asks for, as readable text. */
export type RequestSummary = { room?: string; day?: string; time?: string; faculty?: string };

/** Stored in ScheduleRequest.details; older rows only carry the reason. */
export type RequestDetails = { reason?: string; form?: RequestFormData; current?: RequestSummary; requested?: RequestSummary };

/** One request as the table, cards and drawer show it. */
export type RequestRow = {
  id: string;
  type: string;
  status: string;
  reason: string;
  reviewNote: string;
  requestedByName: string;
  reviewedByName: string;
  scheduleLabel: string;
  scheduleId: string | null;
  createdAt: string;
  updatedAt: string;
  current: RequestSummary | null;
  requested: RequestSummary | null;
  form: RequestFormData | null;
  mine: boolean;
  canReview: boolean;
  canEdit: boolean;
  canCancel: boolean;
  workloadWarning: string | null;
};

type Reviewer = { role: string; userId: string; departmentIds: readonly string[] };
type Reviewable = { status: string; type: string; requestedById: string; requesterRole?: string; departmentId: string | null; targetDepartmentId: string | null };

const ORDINARY = new Set(["NEW_SCHEDULE", "CHANGE_TIME", "CHANGE_ROOM", "CHANGE_FACULTY", "CANCEL_SCHEDULE"]);

/** True when a Head of Department of the owning department could decide it (never the person who filed it). */
function headCanDecide(r: Reviewable, departmentIds: readonly string[]) {
  if (r.type === "FACULTY_CHANGE" || r.requesterRole === "HEAD_OF_DEPARTMENT") return false;
  if (r.targetDepartmentId) return departmentIds.includes(r.targetDepartmentId);
  return ORDINARY.has(r.type) && !!r.departmentId && departmentIds.includes(r.departmentId);
}

/**
 * Who may approve or reject: the Head of Department who owns the request, and nobody else. The Administrator watches
 * everything but decides only what no Head of Department can: faculty-record changes, requests with no owning
 * department, and requests filed by a Head of Department (who cannot approve their own).
 */
export function canReviewRequest(who: Reviewer, r: Reviewable) {
  if (r.status !== "PENDING" || r.requestedById === who.userId) return false;
  if (who.role === "HEAD_OF_DEPARTMENT") return headCanDecide(r, who.departmentIds);
  if (who.role !== "ADMINISTRATOR") return false;
  const owned = r.type !== "FACULTY_CHANGE" && r.requesterRole !== "HEAD_OF_DEPARTMENT" && (!!r.targetDepartmentId || (ORDINARY.has(r.type) && !!r.departmentId));
  return !owned;
}

/** The Head of Department who owns a pending request, or who filed it themselves, is the only one who can change or withdraw it. */
export function canCancelRequest(who: Reviewer, r: Reviewable) {
  if (r.status !== "PENDING" || who.role !== "HEAD_OF_DEPARTMENT") return false;
  return r.requestedById === who.userId || headCanDecide(r, who.departmentIds);
}

/** Only the plain class requests can be edited; the person who filed one as faculty cannot change it afterwards. */
export const canEditRequest = (who: Reviewer, r: Reviewable) => ORDINARY.has(r.type) && canCancelRequest(who, r);
