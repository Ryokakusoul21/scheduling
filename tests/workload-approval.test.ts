import { describe, expect, it } from "vitest";
import { approveRow, awaitingLabel, canApprove, canEdit, canReject, proposalOutcome, type ReviewRow } from "@/lib/workload/approval";

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({ status: "PENDING", fromDepartmentId: "ccs", toDepartmentId: "ccs", fromApprovedById: null, toApprovedById: null, ...over });
const ccsHead = { isAdmin: false, departmentIds: ["ccs"] };
const genedHead = { isAdmin: false, departmentIds: ["gened"] };
const admin = { isAdmin: true, departmentIds: [] };

describe("workload approval permissions", () => {
  it("lets the department's Head approve a same-department row in one step", () => {
    expect(canApprove(ccsHead, row())).toBe(true);
    expect(approveRow(ccsHead, row(), "u1")).toEqual({ fromApprovedById: "u1", toApprovedById: null, ready: true });
  });

  it("keeps other departments out of rows they are not part of", () => {
    expect(canApprove(genedHead, row())).toBe(false);
    expect(canReject(genedHead, row())).toBe(false);
    expect(canEdit(genedHead, row())).toBe(false);
  });

  it("needs both Heads for a cross-department row and says who is missing", () => {
    const cross = row({ toDepartmentId: "gened" });
    expect(approveRow(ccsHead, cross, "u1").ready).toBe(false);
    const waiting = { ...cross, status: "APPROVED" as const, fromApprovedById: "u1" };
    expect(awaitingLabel(waiting, { from: "College of Computer Studies", to: "General Education Department" })).toBe("Awaiting General Education Department approval");
    expect(canApprove(ccsHead, waiting)).toBe(false);
    expect(canApprove(genedHead, waiting)).toBe(true);
    expect(approveRow(genedHead, waiting, "u2")).toEqual({ fromApprovedById: "u1", toApprovedById: "u2", ready: true });
  });

  it("lets the Administrator approve both sides at once", () => {
    expect(approveRow(admin, row({ toDepartmentId: "gened" }), "a1").ready).toBe(true);
  });

  it("lets only the giving department change the receiver", () => {
    const cross = row({ toDepartmentId: "gened" });
    expect(canEdit(ccsHead, cross)).toBe(true);
    expect(canEdit(genedHead, cross)).toBe(false);
    expect(canReject(genedHead, cross)).toBe(true);
  });

  it("closes nothing while rows are open, then reports the outcome", () => {
    expect(proposalOutcome([{ status: "APPLIED" }, { status: "APPROVED" }])).toBe("PENDING");
    expect(proposalOutcome([{ status: "APPLIED" }, { status: "REJECTED" }])).toBe("APPLIED");
    expect(proposalOutcome([{ status: "REJECTED" }, { status: "REJECTED" }])).toBe("REJECTED");
    expect(canApprove(ccsHead, row({ status: "APPLIED" }))).toBe(false);
  });
});
