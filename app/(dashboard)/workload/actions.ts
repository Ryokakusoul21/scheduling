"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope } from "@/lib/permissions/scope";
import { logBlocked } from "@/lib/permissions/department";
import { runWorkloadCheck, undoFix } from "@/lib/workload/auto";
import { editProposalRow, reviewProposal } from "@/lib/workload/review";
import type { Move } from "@/lib/workload/optimizer";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function revalidate() {
  for (const path of ["/workload", "/dashboard", "/scheduler", "/faculty", "/subjects", "/my-subjects"]) revalidatePath(path);
}

/** Runs the workload check immediately (it also runs after every change that affects a load). */
export async function recheckWorkloadAction(): Promise<Result<{ proposed: number; flags: number }>> {
  const scope = await requireScope(...STAFF_ROLES);
  const status = await runWorkloadCheck("Manual recheck", scope.userId);
  revalidate();
  return { ok: true, data: { proposed: status.proposed, flags: status.flags.filter((f) => f.kind !== "UNDERLOADED").length } };
}

const reviewSchema = z.object({
  proposalId: z.string().min(1),
  version: z.number().int().min(1),
  itemIds: z.array(z.string().min(1)).max(200).optional(),
  reason: z.string().max(500).optional(),
});

type ReviewData = { applied: number; rejected: number; awaiting: number; summary: string | null };

async function review(decision: "APPROVE" | "REJECT", input: z.infer<typeof reviewSchema>): Promise<Result<ReviewData>> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Refresh the page and try again." };
  const result = await reviewProposal(scope, { ...parsed.data, decision });
  if (!result.ok) {
    if (result.error.startsWith("There is nothing")) await logBlocked(scope, `${decision === "APPROVE" ? "approve" : "reject"} a workload proposal outside the department`, "WorkloadProposal", parsed.data.proposalId);
    return result;
  }
  revalidate();
  const { applied, rejected, awaiting, summary } = result;
  return { ok: true, data: { applied, rejected, awaiting, summary } };
}

/** Approves the given rows (or every row the reviewer may approve); applied atomically after re-validation. */
export async function approveProposalAction(input: z.infer<typeof reviewSchema>) {
  return review("APPROVE", input);
}

/** Rejects the given rows (or the whole proposal); the reason is optional. */
export async function rejectProposalAction(input: z.infer<typeof reviewSchema>) {
  return review("REJECT", input);
}

/** Picks a different receiver for one row; the row is re-validated and both approvals start over. */
export async function editProposalRowAction(input: { proposalId: string; version: number; itemId: string; toFacultyId: string }): Promise<Result<Move>> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = z.object({ proposalId: z.string().min(1), version: z.number().int().min(1), itemId: z.string().min(1), toFacultyId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a faculty member." };
  const result = await editProposalRow(scope, parsed.data);
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: result.move };
}

/** Undoes one applied fix; a Head of Department may undo fixes within their department. */
export async function undoFixAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const fix = await prisma.workloadFix.findUnique({ where: { id } });
  if (!fix) return { ok: false, error: "This fix no longer exists." };
  if (!scope.isAdmin) {
    const both = await prisma.faculty.findMany({ where: { id: { in: [fix.fromFacultyId, fix.toFacultyId] } }, select: { departmentId: true } });
    if (!both.every((f) => canManageDepartment(scope, f.departmentId))) return { ok: false, error: "Only the Administrator can undo fixes that cross departments." };
  }
  const problem = await undoFix(id, scope.userId);
  if (problem) return { ok: false, error: problem };
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: fix.departmentId, action: `Undid workload fix: ${fix.label}`, entity: "WorkloadFix", entityId: id } });
  revalidate();
  return { ok: true, data: undefined };
}
