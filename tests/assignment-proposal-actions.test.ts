import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
const sync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/subjects/assignment-curriculum", () => ({ syncAssignedCurriculum: sync, AssignmentCurriculumError: class extends Error {} }));

const m = vi.hoisted(() => ({
  role: "HEAD_OF_DEPARTMENT",
  scope: { userId: "requester", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentId: "ccs", departmentIds: ["ccs"], actingDepartmentIds: [], programIds: [], facultyId: null, name: "Head", isAdmin: false },
  requireScope: vi.fn(),
  subjectRows: vi.fn(),
  term: vi.fn(),
  sections: vi.fn(),
  activeAssignments: vi.fn(),
  pendingProposals: vi.fn(),
  proposal: vi.fn(),
  createProposals: vi.fn(),
  updateProposal: vi.fn(),
  currentAssignment: vi.fn(),
  staleCount: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  auditMany: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  notifyManagers: vi.fn(),
  notifyUsers: vi.fn(),
  notifyFaculty: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({
  requireScope: m.requireScope,
  policyUserFromScope: (scope: typeof m.scope) => ({
    id: scope.userId, role: scope.role, status: scope.status, archivedAt: scope.archivedAt,
    departmentId: scope.departmentId, departmentIds: scope.departmentIds,
    actingDepartmentIds: scope.actingDepartmentIds, programIds: scope.programIds, facultyId: scope.facultyId,
  }),
}));
vi.mock("@/lib/permissions/department", () => ({ logBlocked: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyManagers: m.notifyManagers, notifyUsers: m.notifyUsers, notifyFaculty: m.notifyFaculty }));
vi.mock("@/lib/workload/auto", () => ({ queueWorkloadCheck: vi.fn() }));
vi.mock("@/lib/subjects/assignments", () => ({
  assignableFaculty: vi.fn(async () => ({
    measure: "HOURS",
    faculty: [{
      id: "faculty", name: "Professor One", email: "faculty@example.test", employeeId: "F-1",
      departmentId: "faculty-dept", departmentName: "Faculty Department", specialization: null,
      employmentType: "FULL_TIME", load: 6, minimum: 3, limit: 24, unavailability: [],
    }],
  })),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    subject: { findMany: m.subjectRows },
    semester: { findUnique: m.term },
    section: { findMany: m.sections },
    subjectAssignment: { findMany: m.activeAssignments },
    subjectAssignmentProposal: { findMany: m.pendingProposals, findUnique: m.proposal },
    schedule: { count: m.staleCount },
    $transaction: m.transaction,
  },
}));

import { createAssignmentProposalsAction, reviewAssignmentProposalAction } from "@/app/(dashboard)/subjects/assignment-proposal-actions";

const subject = {
  id: "subject", code: "GE1", name: "Purposive Communication", level: "COLLEGE",
  semester: "FIRST", departmentId: null, programId: null, yearLevel: "FIRST", gradeLevel: null, sharedPrograms: [],
};
const term = { id: "term", name: "First Semester", type: "FIRST", level: "COLLEGE", academicYear: { name: "2026-2027" } };
const section = { id: "section", name: "BSIT 1-A", level: "COLLEGE", semesterId: "term", departmentId: "ccs", programId: "bsit", yearLevel: "FIRST", gradeLevel: null };
const proposal = {
  id: "proposal", status: "PENDING", subjectId: "subject", facultyId: "faculty", sectionId: "section", semesterId: "term",
  reviewDepartmentId: "faculty-dept", requestedById: "requester", subject: { ...subject, archivedAt: null },
  faculty: { id: "faculty", fullName: "Professor One", departmentId: "faculty-dept", status: "ACTIVE", archivedAt: null, teachingLevels: ["COLLEGE"] },
  section, semester: term, requestedBy: { id: "requester" },
};
const input = { subjectIds: ["subject"], semesterId: "term", changes: [{ sectionId: "section", facultyId: "faculty" }] };

describe("subject assignment proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sync.mockResolvedValue(0);
    m.role = "HEAD_OF_DEPARTMENT";
    m.scope = { ...m.scope, userId: "requester", role: "HEAD_OF_DEPARTMENT", departmentId: "ccs", departmentIds: ["ccs"] };
    m.requireScope.mockImplementation(async (...roles: string[]) => {
      if (!roles.includes(m.role)) throw new Error("Forbidden");
      return m.scope;
    });
    m.subjectRows.mockResolvedValue([subject]);
    m.term.mockResolvedValue(term);
    m.sections.mockResolvedValue([section]);
    m.activeAssignments.mockResolvedValue([]);
    m.pendingProposals.mockResolvedValue([]);
    m.proposal.mockResolvedValue(proposal);
    m.createProposals.mockResolvedValue({ count: 1 });
    m.updateProposal.mockResolvedValue({ count: 1 });
    m.currentAssignment.mockResolvedValue(null);
    m.staleCount.mockResolvedValue(0);
    m.createAssignment.mockResolvedValue({ id: "active-assignment" });
    m.updateAssignment.mockResolvedValue({});
    m.auditMany.mockResolvedValue({ count: 1 });
    m.audit.mockResolvedValue({});
    const tx = {
      $executeRaw: vi.fn(),
      subjectAssignmentProposal: { createMany: m.createProposals, findUnique: m.proposal, updateMany: m.updateProposal },
      subjectAssignment: { findFirst: m.currentAssignment, create: m.createAssignment, update: m.updateAssignment },
      auditLog: { createMany: m.auditMany, create: m.audit },
    };
    m.transaction.mockImplementation(async (callback) => callback(tx));
  });

  it("creates a pending proposal without activating the subject assignment", async () => {
    const result = await createAssignmentProposalsAction(input);
    expect(result).toMatchObject({ ok: true, changed: 1 });
    expect(m.createProposals).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        subjectId: "subject", facultyId: "faculty", sectionId: "section",
        semesterId: "term", reviewDepartmentId: "faculty-dept", requestedById: "requester",
      })],
    });
    expect(m.createAssignment).not.toHaveBeenCalled();
    expect(m.notifyManagers).toHaveBeenCalledWith("faculty-dept", expect.objectContaining({ link: "/assignment-approvals" }));
    expect(m.notifyFaculty).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/review-center");
  });

  it("activates and notifies the assignment only after the faculty department approves", async () => {
    m.scope = { ...m.scope, userId: "faculty-head", role: "HEAD_OF_DEPARTMENT", departmentId: "faculty-dept", departmentIds: ["faculty-dept"] };
    const result = await reviewAssignmentProposalAction({ proposalId: "proposal", decision: "APPROVED" });
    expect(result).toMatchObject({ ok: true, changed: 1 });
    expect(m.updateProposal).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", reviewedById: "faculty-head" }) }));
    expect(m.createAssignment).toHaveBeenCalledWith({ data: expect.objectContaining({ subjectId: "subject", facultyId: "faculty", sectionId: "section", semesterId: "term" }) });
    expect(sync).toHaveBeenCalledWith(expect.anything(), [{ subjectId: "subject", sectionId: "section", semesterId: "term" }]);
    expect(m.notifyFaculty).toHaveBeenCalledWith(["faculty"], expect.objectContaining({ link: "/my-subjects" }));
    expect(m.notifyUsers).toHaveBeenCalledWith(["requester"], expect.objectContaining({ title: "Subject assignment approved" }));
    expect(revalidatePath).toHaveBeenCalledWith("/admin/review-center");
  });

  it("requires a rejection reason and leaves the assignment inactive when rejected", async () => {
    m.scope = { ...m.scope, userId: "faculty-head", role: "HEAD_OF_DEPARTMENT", departmentId: "faculty-dept", departmentIds: ["faculty-dept"] };
    expect(await reviewAssignmentProposalAction({ proposalId: "proposal", decision: "REJECTED" })).toMatchObject({ ok: false });
    expect(m.proposal).not.toHaveBeenCalled();
    expect(await reviewAssignmentProposalAction({ proposalId: "proposal", decision: "REJECTED", note: "The faculty member is at capacity." })).toMatchObject({ ok: true });
    expect(m.createAssignment).not.toHaveBeenCalled();
    expect(m.notifyFaculty).not.toHaveBeenCalled();
    expect(m.notifyUsers).toHaveBeenCalledWith(["requester"], expect.objectContaining({ title: "Subject assignment rejected" }));
  });

  it("routes proposals only to the proposed faculty member's home department", async () => {
    m.scope = { ...m.scope, userId: "unrelated-head", role: "HEAD_OF_DEPARTMENT", departmentId: "ccs", departmentIds: ["ccs"] };
    expect(await reviewAssignmentProposalAction({ proposalId: "proposal", decision: "APPROVED" })).toMatchObject({ ok: false, error: "You cannot review proposals for this faculty department." });
    expect(m.updateProposal).not.toHaveBeenCalled();
    expect(m.createAssignment).not.toHaveBeenCalled();
  });
  it("supports an owned major subject when the selected faculty belongs to another department", async () => {
    m.subjectRows.mockResolvedValue([{ ...subject, departmentId: "ccs", programId: "bsit" }]);
    expect(await createAssignmentProposalsAction(input)).toMatchObject({ ok: true, changed: 1 });
    expect(m.createAssignment).not.toHaveBeenCalled();
  });
  it.each([{ yearLevel: "SECOND" }, { sharedPrograms: [{ id: "another-course" }] }, { semester: "SECOND" }])("rejects proposals outside the actual section curriculum: %o", async (patch) => {
    m.subjectRows.mockResolvedValue([{ ...subject, ...patch }]);
    expect(await createAssignmentProposalsAction(input)).toMatchObject({ ok: false });
    expect(m.createProposals).not.toHaveBeenCalled();
  });
  it("rechecks curriculum changes before an approval can activate an assignment", async () => {
    m.scope = { ...m.scope, userId: "faculty-head", departmentId: "faculty-dept", departmentIds: ["faculty-dept"] };
    m.proposal.mockResolvedValue({ ...proposal, subject: { ...proposal.subject, sharedPrograms: [{ id: "another-course" }] } });
    expect(await reviewAssignmentProposalAction({ proposalId: "proposal", decision: "APPROVED" })).toMatchObject({ ok: false, error: expect.stringContaining("no longer belongs") });
    expect(m.createAssignment).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });
});
