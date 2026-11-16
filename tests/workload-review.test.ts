import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/permissions/scope";
import type { WorkloadData } from "@/lib/workload/auto";
import { optimize } from "@/lib/workload/optimizer";

const m = vi.hoisted(() => ({
  proposal: vi.fn(), proposals: vi.fn(), load: vi.fn(), basis: vi.fn(), apply: vi.fn(), queue: vi.fn(),
  claim: vi.fn(), update: vi.fn(), item: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  faculty: { findMany: async () => [] }, department: { findMany: async () => [{ id: "cs", name: "Computing" }] },
  workloadProposal: { findUnique: m.proposal, findMany: m.proposals, updateMany: m.claim, update: m.update }, workloadFix: { findMany: async () => [] },
  $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ workloadProposal: { updateMany: m.claim, update: m.update }, workloadProposalItem: { update: m.item }, auditLog: { create: m.audit } }),
} }));
vi.mock("@/lib/workload/load", () => ({ loadWorkload: m.load }));
vi.mock("@/lib/workload/auto", () => ({ activeTermIds: async () => ["term"], getWorkloadStatus: async () => null, proposalBasis: m.basis, applyMoves: m.apply, queueWorkloadCheck: m.queue }));
vi.mock("@/lib/notify", () => ({ notifyFacultyEach: vi.fn(), notifyManagers: vi.fn() }));

import { workloadView } from "@/lib/workload/view";
import { editProposalRow, reviewProposal } from "@/lib/workload/review";

const scope = { role: "HEAD_OF_DEPARTMENT", userId: "head", status: "ACTIVE", departmentId: "cs", departmentIds: ["cs"], manageDepartmentId: "cs", isAdmin: false } as Scope;
function fixture() {
  const data: WorkloadData = {
    limits: { measure: "HOURS", minimum: 0, maximum: 24, partTimeMinimum: 0, partTimeMaximum: 24, maxUnits: 30, tolerance: 0, crossDepartment: "BOTH_HEADS" },
    faculty: ["receiver", "alternate"].map((id) => ({ id, name: id, departmentId: "cs", departmentName: "Computing", teachingLevels: ["COLLEGE"], specialization: null, maxHours: 24, employmentType: "FULL_TIME", availability: [] })),
    assignments: [], unassigned: [{ key: "orphan", assignmentId: "assignment", facultyId: "gone", subjectName: "CC101 Introduction to Computing", subjectUnits: 3, sectionName: "BSCS 1-A", sectionLevel: "COLLEGE", departmentId: "cs", meetings: [], plannedHours: 3 }],
    inactiveNames: new Map([["gone", "Grace Mercado"]]), busy: new Map(), blocked: new Set(),
  };
  const move = optimize(data.faculty, [], data.limits, data.busy, { unassigned: data.unassigned, inactiveNames: data.inactiveNames }).moves[0];
  const row = { id: "row", key: move.key, fromFacultyId: move.fromFacultyId, toFacultyId: move.toFacultyId, fromDepartmentId: "cs", toDepartmentId: "cs", fromApprovedById: null, toApprovedById: null, status: "PENDING", edited: false, move: { ...move, fromBefore: 0, fromAfter: -3 } };
  return { data, row, proposal: { id: "proposal", version: 1, status: "PENDING", kind: "WORKLOAD", basis: "basis", departmentId: "cs", automatic: true, createdAt: new Date("2026-11-16T00:00:00Z"), reviewedAt: null, explanation: "Move classes from inactive faculty.", reviewNote: null, rows: [row] } };
}

beforeEach(() => {
  vi.resetAllMocks();
  const f = fixture();
  m.proposal.mockResolvedValue(f.proposal); m.proposals.mockResolvedValue([f.proposal]); m.load.mockResolvedValue(f.data);
  m.basis.mockReturnValue("basis"); m.claim.mockResolvedValue({ count: 1 }); m.update.mockResolvedValue({}); m.item.mockResolvedValue({});
});

describe("inactive faculty reassignment review", () => {
  it("shows a valid proposal with live loads, usable recipients and the inactive donor in its preview", async () => {
    const view = await workloadView(scope);
    const p = view.proposals[0];
    expect(p.needsRefresh).toBe(false);
    expect(p.rows[0]).toMatchObject({ problem: null, canApprove: true, from: "Grace Mercado", fromInactive: true, fromBefore: 3, fromAfter: 0, subject: "CC101 Introduction to Computing", section: "BSCS 1-A" });
    expect(p.rows[0].candidates?.map((candidate) => candidate.id)).toContain("alternate");
    expect(view.preview.gone).toMatchObject({ name: "Grace Mercado", load: 3, inactive: true });
  });

  it("applies the reviewed inactive-faculty assignment instead of superseding it as stale", async () => {
    const result = await reviewProposal(scope, { proposalId: "proposal", version: 1, itemIds: ["row"], decision: "APPROVE" });
    expect(result).toMatchObject({ ok: true, applied: 1, awaiting: 0 });
    expect(m.apply).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ assignmentId: "assignment", fromFacultyId: "gone", fromDepartmentId: "cs", fromBefore: 3, fromAfter: 0 })], expect.objectContaining({ proposalId: "proposal" }));
    expect(m.item).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPLIED", fromApprovedById: "head" }) }));
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPLIED" }) }));
  });

  it("lets the responsible head change the inactive-faculty assignment's recipient", async () => {
    expect(await editProposalRow(scope, { proposalId: "proposal", version: 1, itemId: "row", toFacultyId: "alternate" })).toMatchObject({ ok: true, move: { toFacultyId: "alternate", fromAfter: 0 } });
    expect(m.item).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ toFacultyId: "alternate", status: "PENDING", fromApprovedById: null, toApprovedById: null, edited: true }) }));
  });

  it("blocks approval in the view when the proposal's basis really changed", async () => {
    m.basis.mockReturnValue("changed");
    const view = await workloadView(scope);
    expect(view.proposals[0]).toMatchObject({ needsRefresh: true, canReview: true });
    expect(view.proposals[0].rows[0]).toMatchObject({ canApprove: false, canReject: true });
    expect(await reviewProposal(scope, { proposalId: "proposal", version: 1, decision: "APPROVE" })).toMatchObject({ ok: false });
    expect(m.apply).not.toHaveBeenCalled();
  });

  it("refuses another department and a concurrently reviewed version before applying anything", async () => {
    expect(await reviewProposal({ ...scope, departmentIds: ["business"] }, { proposalId: "proposal", version: 1, decision: "APPROVE" })).toMatchObject({ ok: false });
    m.claim.mockResolvedValue({ count: 0 });
    expect(await reviewProposal(scope, { proposalId: "proposal", version: 1, decision: "APPROVE" })).toMatchObject({ ok: false });
    expect(m.apply).not.toHaveBeenCalled();
  });
});
