/**
 * Who may approve which side of a proposed reassignment, and when a proposal is finished. A same-department
 * row needs its Head of Department (or the Registrar); a cross-department row also needs the receiving
 * department's Head. Pure (tests/workload-approval.test.ts).
 */

export interface Reviewer {
  isAdmin: boolean;
  departmentIds: readonly string[];
}

export interface ReviewRow {
  status: "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  fromApprovedById: string | null;
  toApprovedById: string | null;
}

export const isCrossDepartment = (r: Pick<ReviewRow, "fromDepartmentId" | "toDepartmentId">) => (r.fromDepartmentId ?? null) !== (r.toDepartmentId ?? null);

/** The sides of a row this reviewer speaks for; a side without a department belongs to the Registrar. */
export function sidesFor(actor: Reviewer, r: Pick<ReviewRow, "fromDepartmentId" | "toDepartmentId">) {
  const owns = (d: string | null) => actor.isAdmin || (!!d && actor.departmentIds.includes(d));
  return { from: owns(r.fromDepartmentId), to: isCrossDepartment(r) && owns(r.toDepartmentId) };
}

const isOpen = (r: ReviewRow) => r.status === "PENDING" || r.status === "APPROVED";

/** Still open and this reviewer has a side whose approval is missing. */
export function canApprove(actor: Reviewer, r: ReviewRow) {
  const s = sidesFor(actor, r);
  return isOpen(r) && ((s.from && !r.fromApprovedById) || (s.to && !r.toApprovedById));
}

/** Either side's Head of Department may turn down an open row. */
export function canReject(actor: Reviewer, r: ReviewRow) {
  const s = sidesFor(actor, r);
  return isOpen(r) && (s.from || s.to);
}

/** Only the giving department's Head (or the Registrar) picks a different receiver. */
export const canEdit = (actor: Reviewer, r: ReviewRow) => r.status === "PENDING" && sidesFor(actor, r).from;

/** Records this reviewer's approval; the row is ready to apply once every required side has approved. */
export function approveRow(actor: Reviewer, r: ReviewRow, userId: string) {
  const s = sidesFor(actor, r);
  const fromApprovedById = r.fromApprovedById ?? (s.from ? userId : null);
  const toApprovedById = isCrossDepartment(r) ? (r.toApprovedById ?? (s.to ? userId : null)) : null;
  const ready = !!fromApprovedById && (!isCrossDepartment(r) || !!toApprovedById);
  return { fromApprovedById, toApprovedById, ready };
}

/** "Awaiting College of Computer Studies approval" for a cross-department row with one side still missing. */
export function awaitingLabel(r: ReviewRow, names: { from: string; to: string }) {
  if (r.status !== "APPROVED") return null;
  if (!r.fromApprovedById) return `Awaiting ${names.from} approval`;
  if (isCrossDepartment(r) && !r.toApprovedById) return `Awaiting ${names.to} approval`;
  return null;
}

/** A proposal stays pending while any row is open; then it is approved if anything was applied, else rejected. */
export function proposalOutcome(rows: Pick<ReviewRow, "status">[]): "PENDING" | "APPLIED" | "REJECTED" {
  if (rows.some((r) => r.status === "PENDING" || r.status === "APPROVED")) return "PENDING";
  return rows.some((r) => r.status === "APPLIED") ? "APPLIED" : "REJECTED";
}
