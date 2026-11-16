import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const m = vi.hoisted(() => ({ submission: vi.fn(), schedules: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: async () => ({ role: "REGISTRAR" }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { timetableSubmission: { findUnique: m.submission }, schedule: { findMany: m.schedules } } }));
vi.mock("@/lib/timetable/service", () => ({ loadTimetableBundle: vi.fn() }));
vi.mock("@/lib/scheduler/term-conflicts", () => ({ concurrentTermIds: vi.fn(), detectConflictsForTerms: vi.fn() }));
vi.mock("@/lib/examinations/context", () => ({ loadExamContext: vi.fn() }));
vi.mock("@/lib/scheduler/submissions", () => ({ LOCKED_STATUSES: ["SUBMITTED", "APPROVED"], SUBMISSION_LABEL: {}, submissionChanges: async () => null, submissionRows: vi.fn() }));
vi.mock("@/app/(dashboard)/admin/review-center/timetables/review-sheets", () => ({ ReviewSheets: () => null }));
vi.mock("@/app/(dashboard)/admin/review-center/timetables/review-panel", () => ({ CommentBox: () => null, DecisionPanel: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import TimetableReviewPage from "@/app/(dashboard)/admin/review-center/timetables/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
  m.schedules.mockResolvedValue([{ subject: "PRIVATE_DRAFT_REVISION" }]);
});

describe("submitted timetable history", () => {
  it.each(["RETURNED", "REJECTED", "WITHDRAWN", "PUBLISHED"])("shows the saved snapshot rather than reading current drafts for a %s package", async (status) => {
    m.submission.mockResolvedValue({
      id: "submission", departmentId: "cs", semesterId: "term", department: { name: "Computing" }, semester: { type: "FIRST_SEMESTER", academicYear: { name: "2026–2027" } },
      submittedBy: { name: "Department Head" }, submittedAt: new Date("2026-11-15T00:00:00Z"), decidedBy: null, comments: [],
      kind: "CLASS", status, version: 1, snapshot: [{ id: "class", section: "BSIT 1A", subject: "ORIGINAL_SUBMITTED_SUBJECT", when: "Monday, 8:00 AM–9:00 AM", room: "Room 101", person: "Original teacher" }],
    });
    const html = renderToStaticMarkup(await TimetableReviewPage({ params: Promise.resolve({ id: "submission" }) }));
    expect(html).toContain("ORIGINAL_SUBMITTED_SUBJECT");
    expect(html).toContain("Original teacher");
    expect(html).toContain("submitted snapshot");
    expect(html).not.toContain("PRIVATE_DRAFT_REVISION");
    expect(m.schedules).not.toHaveBeenCalled();
  });
});
