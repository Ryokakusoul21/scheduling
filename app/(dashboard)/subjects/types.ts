import type { AssignableFaculty } from "@/lib/subjects/assignment-rules";

export type AssignmentRow = { id: string; facultyId: string; facultyName: string; sectionId: string | null; sectionName: string | null };

/** A subject as the assign, request and view panels need it. */
export type SubjectInfo = {
  id: string; code: string; name: string; description: string; units: number; lectureHours: number; labHours: number;
  departmentId: string | null; departmentName: string | null; assignments: AssignmentRow[];
};

/** Everything the panels need for the selected term; null when no term exists yet. */
export type AssignContext = {
  faculty: AssignableFaculty[]; measure: "HOURS" | "UNITS"; sections: { id: string; name: string }[];
  term: { id: string; label: string }; terms: { value: string; label: string }[];
};

export type RequestStatusValue = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELLED";
/** The newest change request filed for a subject. */
export type SubjectRequestInfo = { id: string; status: RequestStatusValue; type: string };

/** One row of the curriculum list. */
export type CurriculumRow = SubjectInfo & {
  requiredRoomType: string; level: string; programId: string; yearLevel: string; gradeLevel: string;
  category: "MAJOR" | "MINOR"; semester: string | null; editable: boolean; classes: number;
  sharedPrograms: { code: string; name: string }[]; request: SubjectRequestInfo | null;
};
