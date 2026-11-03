import { z } from "zod";

export const REQUEST_KINDS = [
  { value: "CHANGE_FACULTY", label: "Change faculty" },
  { value: "CHANGE_SCHEDULE", label: "Change schedule" },
  { value: "CHANGE_UNITS", label: "Change units" },
  { value: "OTHER", label: "Other" },
] as const;

export const REASON_MIN = 20;
export const REASON_MAX = 500;

/** Shared by the request modal and the server action so both validate the same way. */
export const subjectRequestSchema = z.object({
  subjectId: z.string().min(1),
  kind: z.enum(["CHANGE_FACULTY", "CHANGE_SCHEDULE", "CHANGE_UNITS", "OTHER"]),
  reason: z.string().trim().min(REASON_MIN, `Explain the request in at least ${REASON_MIN} characters`).max(REASON_MAX, `Use ${REASON_MAX} characters or fewer`),
  preferredFacultyId: z.string().optional().transform((v) => v || null),
});
export type SubjectRequestInput = z.input<typeof subjectRequestSchema>;

/** Stored in ScheduleRequest.details so the Schedule Requests page and subject rows can read it back. */
export type SubjectRequestDetails = {
  kind: "SUBJECT_CHANGE";
  subjectId: string;
  subjectCode: string;
  changeType: (typeof REQUEST_KINDS)[number]["value"];
  preferredFacultyId: string | null;
  preferredFacultyName: string | null;
};

export const kindLabel = (kind: string) => REQUEST_KINDS.find((k) => k.value === kind)?.label ?? "Other";
