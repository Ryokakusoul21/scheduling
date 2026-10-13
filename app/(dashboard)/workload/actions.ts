"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { PUBLISH_ROLES, STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope } from "@/lib/permissions/scope";
import { applyMoves, queueWorkloadCheck, runWorkloadCheck, undoFix } from "@/lib/workload/auto";
import type { Move } from "@/lib/workload/optimizer";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/workload");
  revalidatePath("/dashboard");
  revalidatePath("/scheduler");
}

/** Runs the continuous workload check immediately (it also runs after every schedule change). */
export async function recheckWorkloadAction(): Promise<Result<{ applied: number; proposed: number; flags: number }>> {
  const scope = await requireScope(...STAFF_ROLES);
  const status = await runWorkloadCheck("Manual recheck", scope.userId);
  revalidate();
  return { ok: true, data: { applied: status.applied, proposed: status.proposed, flags: status.flags.filter((f) => f.kind !== "UNDERLOADED").length } };
}

async function reviewable(id: string) {
  const scope = await requireScope(...PUBLISH_ROLES);
  const proposal = await prisma.workloadProposal.findUnique({ where: { id } });
  if (!proposal || proposal.status !== "PENDING") return { error: "This proposal was already reviewed or replaced by a newer one." } as const;
  // Department proposals may be approved by that department's Head; school-wide ones by the Administrator.
  if (!scope.isAdmin && (!proposal.departmentId || !canManageDepartment(scope, proposal.departmentId))) return { error: "Only the Administrator can approve this proposal." } as const;
  return { scope, proposal } as const;
}

/** Approval applies every move that is still valid; stale or conflicting ones are skipped and reported. */
export async function approveProposalAction(id: string): Promise<Result<{ applied: number; skipped: string[] }>> {
  const r = await reviewable(id);
  if ("error" in r) return { ok: false, error: r.error! };
  const { scope, proposal } = r;
  const result = await applyMoves(proposal.items as unknown as Move[], { mode: "APPROVED", trigger: "Approved proposal", actorId: scope.userId, proposalId: id });
  await prisma.workloadProposal.update({ where: { id }, data: { status: "APPLIED", reviewedById: scope.userId, reviewedAt: new Date() } });
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: `Approved workload proposal: ${result.applied.length} reassignment(s) applied`, entity: "WorkloadProposal", entityId: id, newValue: result },
  });
  queueWorkloadCheck("Workload proposal approved", scope.userId);
  revalidate();
  return { ok: true, data: { applied: result.applied.length, skipped: result.skipped.map((s) => s.reason) } };
}

export async function rejectProposalAction(id: string): Promise<Result> {
  const r = await reviewable(id);
  if ("error" in r) return { ok: false, error: r.error! };
  await prisma.workloadProposal.update({ where: { id }, data: { status: "REJECTED", reviewedById: r.scope.userId, reviewedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: r.scope.userId, action: "Rejected workload proposal", entity: "WorkloadProposal", entityId: id } });
  revalidate();
  return { ok: true, data: undefined };
}

/** Undoes one applied fix; a Head of Department may undo fixes within their department. */
export async function undoFixAction(id: string): Promise<Result> {
  const scope = await requireScope(...PUBLISH_ROLES);
  const fix = await prisma.workloadFix.findUnique({ where: { id } });
  if (!fix) return { ok: false, error: "This fix no longer exists." };
  if (!scope.isAdmin) {
    const both = await prisma.faculty.findMany({ where: { id: { in: [fix.fromFacultyId, fix.toFacultyId] } }, select: { departmentId: true } });
    if (!both.every((f) => canManageDepartment(scope, f.departmentId))) return { ok: false, error: "Only the Administrator can undo fixes that cross departments." };
  }
  const problem = await undoFix(id, scope.userId);
  if (problem) return { ok: false, error: problem };
  await prisma.auditLog.create({ data: { userId: scope.userId, action: `Undid workload fix: ${fix.label}`, entity: "WorkloadFix", entityId: id } });
  revalidate();
  return { ok: true, data: undefined };
}
