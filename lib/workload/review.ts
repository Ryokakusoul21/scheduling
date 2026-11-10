import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { notifyFacultyEach, notifyManagers } from "@/lib/notify";
import { loadWorkload } from "./load";
import { activeTermIds, applyMoves, proposalBasis, queueWorkloadCheck, type WorkloadData } from "./auto";
import { approveRow, canApprove, canEdit, canReject, proposalOutcome, type ReviewRow } from "./approval";
import { balanceSummary, loadReport, validateRows, type Move } from "./optimizer";

type Fail = { ok: false; error: string };
const STALE = "Someone else reviewed this proposal or the timetable changed. Refresh to see the latest version.";
const unitOf = (data: WorkloadData) => (data.limits.measure === "HOURS" ? "hours" : "units");

async function open(proposalId: string, version: number) {
  const p = await prisma.workloadProposal.findUnique({ where: { id: proposalId }, include: { rows: true } });
  if (!p || p.kind !== "WORKLOAD") return { error: "This proposal no longer exists." } as const;
  if (p.status !== "PENDING") return { error: "This proposal was already reviewed or replaced by a newer one." } as const;
  if (p.version !== version) return { error: STALE } as const;
  return { p } as const;
}

/** Marks a proposal outdated and asks for a fresh one. */
async function supersede(id: string, why: string, actorId: string) {
  await prisma.workloadProposal.updateMany({ where: { id, status: "PENDING" }, data: { status: "SUPERSEDED", version: { increment: 1 } } });
  queueWorkloadCheck(why, actorId);
}

/** "0 overloaded, 0 underloaded, 9 balanced" for a department (every faculty member for a null department). */
export function departmentSummary(data: WorkloadData, departmentId: string | null) {
  const team = data.faculty.filter((f) => !departmentId || f.departmentId === departmentId);
  const rows = loadReport(team, data.assignments, data.limits).map((r) => ({ ...r, departmentId: team.find((f) => f.id === r.facultyId)!.departmentId }));
  const s = balanceSummary(rows, data.limits.tolerance);
  return `${s.overloaded} overloaded, ${s.underloaded} underloaded, ${s.balanced} balanced`;
}

const actorOf = (scope: Scope) => ({ isAdmin: scope.isAdmin, departmentIds: scope.departmentIds });

/**
 * Approves or rejects rows of a proposal (all of them when no ids are given). Approval re-validates every
 * ready row against the live timetable, then applies them, updates the rows, and closes the proposal in one
 * transaction guarded by the proposal version; anything stale is refused and the proposal superseded.
 */
export async function reviewProposal(scope: Scope, input: { proposalId: string; version: number; decision: "APPROVE" | "REJECT"; itemIds?: string[]; reason?: string }) {
  if (scope.role !== "HEAD_OF_DEPARTMENT") return { ok: false, error: "Only department heads can review workload fixes." } satisfies Fail;
  if (input.decision === "REJECT" && !input.reason?.trim()) return { ok: false, error: "A rejection reason is required." } satisfies Fail;
  const found = await open(input.proposalId, input.version);
  if ("error" in found) return { ok: false, error: found.error! } satisfies Fail;
  const { p } = found;
  const actor = actorOf(scope);
  const chosen = p.rows.filter((r) => !input.itemIds || input.itemIds.includes(r.id));
  const targets = chosen.filter((r) => (input.decision === "APPROVE" ? canApprove : canReject)(actor, r as ReviewRow));
  if (!targets.length) return { ok: false, error: `There is nothing selected here that you can ${input.decision === "APPROVE" ? "approve" : "reject"}.` } satisfies Fail;
  const now = new Date();
  const reason = input.reason?.trim().slice(0, 500) || null;

  if (input.decision === "REJECT") {
    const statuses = p.rows.map((r) => (targets.includes(r) ? { status: "REJECTED" as const } : r));
    const outcome = proposalOutcome(statuses);
    const done = await prisma.$transaction(async (tx) => {
      if ((await tx.workloadProposal.updateMany({ where: { id: p.id, version: p.version, status: "PENDING" }, data: { version: { increment: 1 } } })).count !== 1) return false;
      await tx.workloadProposalItem.updateMany({ where: { id: { in: targets.map((r) => r.id) } }, data: { status: "REJECTED", reviewedById: scope.userId, reviewedAt: now } });
      await tx.workloadProposal.update({ where: { id: p.id }, data: { status: outcome, ...(outcome !== "PENDING" ? { reviewedById: scope.userId, reviewedAt: now } : {}), ...(reason ? { reviewNote: reason } : {}) } });
      await tx.auditLog.create({
        data: {
          userId: scope.userId, role: scope.role, departmentId: p.departmentId, entity: "WorkloadProposal", entityId: p.id, reason,
          action: `Rejected ${targets.length} workload reassignment(s)${reason ? `: ${reason}` : ""}`,
          oldValue: { rows: targets.map((r) => r.move) } as never,
        },
      });
      return true;
    });
    if (!done) return { ok: false, error: STALE } satisfies Fail;
    // The next check offers alternatives; rejected pairs are never suggested again.
    queueWorkloadCheck("Workload reassignments rejected", scope.userId);
    return { ok: true as const, applied: 0, rejected: targets.length, awaiting: 0, summary: null };
  }

  const data = await loadWorkload(await activeTermIds(), null);
  if (p.basis !== proposalBasis(data, p.departmentId, p.rows)) {
    await supersede(p.id, "A workload proposal was out of date", scope.userId);
    return { ok: false, error: "The timetable changed since this proposal was made, so it was replaced. A new proposal is being prepared." } satisfies Fail;
  }
  const approvals = targets.map((r) => ({ r, ...approveRow(actor, r as ReviewRow, scope.userId) }));
  const ready = approvals.filter((a) => a.ready);
  const checked = validateRows(data, ready.map((a) => ({ key: a.r.key, fromFacultyId: a.r.fromFacultyId, toFacultyId: a.r.toFacultyId, reason: (a.r.move as unknown as Move).reason })));
  if (!checked.ok) {
    await supersede(p.id, "A workload proposal was no longer valid", scope.userId);
    return { ok: false, error: `This proposal is no longer valid, so it was replaced: ${checked.problems.join(" ")}` } satisfies Fail;
  }
  const applied = new Map(ready.map((a, i) => [a.r.id, checked.moves[i]]));
  const statuses = p.rows.map((r) => (applied.has(r.id) ? { status: "APPLIED" as const } : approvals.some((a) => a.r.id === r.id) ? { status: "APPROVED" as const } : r));
  const outcome = proposalOutcome(statuses);

  const done = await prisma.$transaction(async (tx) => {
    if ((await tx.workloadProposal.updateMany({ where: { id: p.id, version: p.version, status: "PENDING" }, data: { version: { increment: 1 } } })).count !== 1) return false;
    await applyMoves(tx, checked.moves, { measure: data.limits.measure, actorId: scope.userId, proposalId: p.id });
    for (const a of approvals) {
      const move = applied.get(a.r.id);
      await tx.workloadProposalItem.update({
        where: { id: a.r.id },
        data: { fromApprovedById: a.fromApprovedById, toApprovedById: a.toApprovedById, status: move ? "APPLIED" : "APPROVED", reviewedById: scope.userId, reviewedAt: now, ...(move ? { move: move as never } : {}) },
      });
    }
    await tx.workloadProposal.update({ where: { id: p.id }, data: { status: outcome, ...(outcome !== "PENDING" ? { reviewedById: scope.userId, reviewedAt: now } : {}) } });
    await tx.auditLog.create({
      data: {
        userId: scope.userId, role: scope.role, departmentId: p.departmentId, entity: "WorkloadProposal", entityId: p.id,
        action: `Approved ${approvals.length} workload reassignment(s); ${checked.moves.length} applied`,
        newValue: { applied: checked.moves, awaitingOtherDepartment: approvals.filter((a) => !a.ready).map((a) => a.r.move) } as never,
      },
    });
    return true;
  }, { timeout: 30000 }).catch((e: Error) => (e.message === "STALE" ? false : Promise.reject(e)));
  if (!done) return { ok: false, error: STALE } satisfies Fail;

  const fresh = await loadWorkload(await activeTermIds(), null);
  // Rows still open now rest on the new loads, so the basis moves with them.
  if (outcome === "PENDING" && checked.moves.length) await prisma.workloadProposal.update({ where: { id: p.id }, data: { basis: proposalBasis(fresh, p.departmentId, p.rows) } });
  await notifyLoadChanges(fresh, checked.moves);
  for (const dept of new Set(approvals.filter((a) => !a.ready && !a.toApprovedById).map((a) => a.r.toDepartmentId).filter((d): d is string => !!d))) {
    await notifyManagers(dept, { title: "Workload fixes need your approval", message: "Another department approved giving classes to your faculty. Approve your side in Faculty Workload.", link: "/workload" });
  }
  queueWorkloadCheck("Workload proposal approved", scope.userId);
  return { ok: true as const, applied: checked.moves.length, rejected: 0, awaiting: approvals.length - checked.moves.length, summary: departmentSummary(fresh, p.departmentId) };
}

/** Tells each affected faculty member their old and new load and which classes they gained or lost. */
async function notifyLoadChanges(data: WorkloadData, moves: Move[]) {
  const unit = unitOf(data);
  const people = [...new Set(moves.flatMap((m) => [m.fromFacultyId, m.toFacultyId]))];
  const now = new Map(loadReport(data.faculty, data.assignments, data.limits).map((r) => [r.facultyId, r.load]));
  await notifyFacultyEach(people.map((id) => {
    const lost = moves.filter((m) => m.fromFacultyId === id);
    const gained = moves.filter((m) => m.toFacultyId === id);
    const first = moves.find((m) => m.fromFacultyId === id || m.toFacultyId === id)!;
    const before = first.fromFacultyId === id ? first.fromBefore : first.toBefore;
    const parts = [gained.length && `Added: ${gained.map((m) => m.label).join("; ")}.`, lost.length && `Removed: ${lost.map((m) => m.label).join("; ")}.`].filter(Boolean).join(" ");
    return { facultyIds: [id], msg: { title: "Your teaching load changed", message: `Your load went from ${before} to ${now.get(id) ?? 0} ${unit} after an approved workload proposal. ${parts}`, link: "/workload" } };
  }));
}

/** Gives a proposed row to a different faculty member after re-validating it; both approvals start over. */
export async function editProposalRow(scope: Scope, input: { proposalId: string; version: number; itemId: string; toFacultyId: string }) {
  if (scope.role !== "HEAD_OF_DEPARTMENT") return { ok: false, error: "Only department heads can edit workload fixes." } satisfies Fail;
  const found = await open(input.proposalId, input.version);
  if ("error" in found) return { ok: false, error: found.error! } satisfies Fail;
  const { p } = found;
  const row = p.rows.find((r) => r.id === input.itemId);
  if (!row || !canEdit(actorOf(scope), row as ReviewRow)) return { ok: false, error: "Only the giving department's Head of Department can change this row." } satisfies Fail;
  if (input.toFacultyId === row.fromFacultyId) return { ok: false, error: "Choose someone other than the current teacher." } satisfies Fail;
  const data = await loadWorkload(await activeTermIds(), null);
  if (p.basis !== proposalBasis(data, p.departmentId, p.rows)) {
    await supersede(p.id, "A workload proposal was out of date", scope.userId);
    return { ok: false, error: "The timetable changed since this proposal was made, so it was replaced. A new proposal is being prepared." } satisfies Fail;
  }
  const checked = validateRows(data, [{ key: row.key, fromFacultyId: row.fromFacultyId, toFacultyId: input.toFacultyId, reason: "Receiver chosen by the Head of Department." }]);
  if (!checked.ok) return { ok: false, error: checked.problems.join(" ") } satisfies Fail;
  const move = checked.moves[0];
  const rows = p.rows.map((r) => (r.id === row.id ? { ...r, toFacultyId: move.toFacultyId } : r));
  const done = await prisma.$transaction(async (tx) => {
    if ((await tx.workloadProposal.updateMany({ where: { id: p.id, version: p.version, status: "PENDING" }, data: { version: { increment: 1 }, basis: proposalBasis(data, p.departmentId, rows) } })).count !== 1) return false;
    await tx.workloadProposalItem.update({
      where: { id: row.id },
      data: { toFacultyId: move.toFacultyId, toDepartmentId: move.toDepartmentId, move: move as never, edited: true, status: "PENDING", fromApprovedById: null, toApprovedById: null },
    });
    await tx.auditLog.create({
      data: {
        userId: scope.userId, role: scope.role, departmentId: p.departmentId, entity: "WorkloadProposal", entityId: p.id,
        action: `Changed the receiver of ${move.label} in a workload proposal`, oldValue: row.move as never, newValue: move as never,
      },
    });
    return true;
  });
  if (!done) return { ok: false, error: STALE } satisfies Fail;
  return { ok: true as const, move };
}
