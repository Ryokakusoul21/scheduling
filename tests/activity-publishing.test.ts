import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "HEAD_OF_DEPARTMENT", proposal: vi.fn(), term: vi.fn(), duplicate: vi.fn(), overlaps: vi.fn(), exams: vi.fn(),
  rows: vi.fn(), claim: vi.fn(), activity: vi.fn(), updateRow: vi.fn(), audit: vi.fn(), transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/scope", () => ({ requireScope: vi.fn(async (...roles: string[]) => {
  if (!roles.includes(mocks.role)) throw new Error("Forbidden");
  return { role: mocks.role, userId: "head", name: "Department Head", departmentId: "cs", departmentIds: ["cs"], isAdmin: false };
}) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  activityProposal: { findUnique: mocks.proposal }, semester: { findUnique: mocks.term },
  activity: { findFirst: mocks.duplicate, findMany: mocks.overlaps }, examination: { count: mocks.exams },
  activityProposalRow: { findMany: mocks.rows }, $transaction: mocks.transaction,
} }));

import { submitProposalAction } from "@/app/(dashboard)/calendar/proposals/actions";

const date = new Date("2026-11-12T00:00:00Z");
const proposal = {
  id: "proposal", status: "DRAFT", updatedAt: date, semesterId: "term", departmentId: "cs", level: "COLLEGE", version: 1,
  preparedBy: "Department Head", designation: "Head of Department", createdById: "head",
  rows: [{ id: "row", title: "Department orientation", startDate: date, endDate: date, startMin: 480, endMin: 540, location: "Hall", level: "COLLEGE", category: "SCHOOL_EVENT", activityId: null }],
};

describe("direct publication of department activities", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.role = "HEAD_OF_DEPARTMENT";
    mocks.proposal.mockResolvedValue(proposal);
    mocks.term.mockResolvedValue({ academicYear: { startDate: new Date("2026-06-01"), endDate: new Date("2027-05-31") } });
    mocks.rows.mockResolvedValue([]);
    mocks.duplicate.mockResolvedValue(null);
    mocks.overlaps.mockResolvedValue([]);
    mocks.exams.mockResolvedValue(0);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.activity.mockResolvedValue({ id: "activity" });
    mocks.transaction.mockImplementation(async (fn) => fn({
      activityProposal: { updateMany: mocks.claim }, activity: { create: mocks.activity },
      activityProposalRow: { update: mocks.updateRow }, auditLog: { create: mocks.audit },
    }));
  });

  it("publishes validated rows and their calendar records atomically without registrar review", async () => {
    expect(await submitProposalAction("proposal")).toEqual({ ok: true });
    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }));
    expect(mocks.activity).toHaveBeenCalledWith({ data: expect.objectContaining({ departmentId: "cs", status: "APPROVED", startMin: 480, endMin: 540 }) });
    expect(mocks.updateRow).toHaveBeenCalledWith({ where: { id: "row" }, data: { activityId: "activity", status: "APPROVED", reviewNote: null } });
    expect(mocks.audit).toHaveBeenCalled();
  });

  it.each(["REGISTRAR", "SUPER_ADMINISTRATOR", "FACULTY"])("rejects %s before reading proposals", async (role) => {
    mocks.role = role;
    await expect(submitProposalAction("proposal")).rejects.toThrow("Forbidden");
    expect(mocks.proposal).not.toHaveBeenCalled();
  });

  it("refuses other departments and prevents duplicate publication", async () => {
    mocks.proposal.mockResolvedValue({ ...proposal, departmentId: "business" });
    expect(await submitProposalAction("proposal")).toMatchObject({ ok: false });
    mocks.proposal.mockResolvedValue({ ...proposal, status: "APPROVED" });
    expect(await submitProposalAction("proposal")).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("revalidates conflicts before publication", async () => {
    mocks.exams.mockResolvedValue(1);
    expect(await submitProposalAction("proposal")).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not create calendar records when the draft changed during validation", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    expect(await submitProposalAction("proposal")).toMatchObject({ ok: false });
    expect(mocks.activity).not.toHaveBeenCalled();
  });
});
