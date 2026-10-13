"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { PUBLISH_ROLES, STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope } from "@/lib/permissions/scope";
import { weeklyDoubleBooking } from "@/lib/scheduler/term-conflicts";
import { loadWorkload } from "@/lib/workload/load";
import { explain, loadReport, optimize, type Move } from "@/lib/workload/optimizer";
import { narrate } from "@/lib/ai/narrative";
import { notifyFaculty, notifyManagers } from "@/lib/notify";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Runs the optimizer and stores its suggestions as a proposal awaiting approval. */
export async function generateProposalAction(termId: string): Promise<Result<{ proposalId: string | null; explanation: string }>> {
  const scope = await requireScope(...STAFF_ROLES);
  const term = await prisma.semester.findUnique({ where: { id: termId }, select: { id: true } });
  if (!term) return { ok: false, error: "Choose a term." };

  const { limits, faculty, assignments, busy } = await loadWorkload([term.id], scope.manageDepartmentId);
  const before = loadReport(faculty, assignments, limits);
  const { moves, after } = optimize(faculty, assignments, limits, busy);
  const explanation = explain(before, after, moves);
  if (moves.length === 0) return { ok: true, data: { proposalId: null, explanation } };

  // The narrative sees anonymized positions only, never names.
  const alias = new Map(faculty.map((f, i) => [f.id, `Faculty member ${i + 1}`]));
  const narrative = await narrate("Explain these proposed teaching load reassignments and why they balance the workload.", {
    limits,
    summary: explanation,
    moves: moves.map((m) => ({ from: alias.get(m.fromFacultyId), to: alias.get(m.toFacultyId), amount: m.amount, measure: limits.measure })),
  });

  const proposal = await prisma.workloadProposal.create({
    data: { semesterId: term.id, departmentId: scope.isAdmin ? null : scope.departmentId, items: moves as never, explanation, narrative, createdById: scope.userId },
  });
  await notifyManagers(scope.isAdmin ? null : scope.departmentId, {
    title: "Workload reassignments awaiting approval",
    message: `${moves.length} teaching load reassignment(s) were proposed. Review and approve them in Faculty Workload.`,
    link: "/workload",
  });
  await prisma.auditLog.create({ data: { userId: scope.userId, action: `Generated ${moves.length} workload reassignment suggestion(s)`, entity: "WorkloadProposal", entityId: proposal.id } });
  revalidatePath("/workload");
  return { ok: true, data: { proposalId: proposal.id, explanation } };
}

async function reviewable(id: string) {
  const scope = await requireScope(...PUBLISH_ROLES);
  const proposal = await prisma.workloadProposal.findUnique({ where: { id } });
  if (!proposal || proposal.status !== "PENDING") return { error: "This proposal was already reviewed." } as const;
  // Department proposals may be approved by that department's Head; school-wide ones by the Administrator.
  if (!scope.isAdmin && (!proposal.departmentId || !canManageDepartment(scope, proposal.departmentId))) return { error: "Only the Administrator can approve this proposal." } as const;
  return { scope, proposal } as const;
}

/** Approval applies every move that is still valid; stale ones are skipped and reported. */
export async function approveProposalAction(id: string): Promise<Result<{ applied: number; skipped: string[] }>> {
  const r = await reviewable(id);
  if ("error" in r) return { ok: false, error: r.error! };
  const { scope, proposal } = r;
  const moves = proposal.items as unknown as Move[];
  const skipped: string[] = [];
  let applied = 0;

  for (const m of moves) {
    const meetings = await prisma.schedule.findMany({ where: { id: { in: m.scheduleIds } } });
    if (meetings.length !== m.scheduleIds.length || meetings.some((s) => s.facultyId !== m.fromFacultyId)) {
      skipped.push(`${m.label}: the class changed since the proposal was made.`);
      continue;
    }
    const clashes = await Promise.all(meetings.map((s) => weeklyDoubleBooking({ ...s, facultyId: m.toFacultyId }, s.id)));
    const clash = clashes.find(Boolean);
    if (clash) {
      skipped.push(`${m.label}: ${clash}`);
      continue;
    }
    await prisma.schedule.updateMany({ where: { id: { in: m.scheduleIds } }, data: { facultyId: m.toFacultyId } });
    await notifyFaculty([m.fromFacultyId, m.toFacultyId], { title: "Teaching load reassigned", message: `${m.label} was reassigned. ${m.reason}`, link: "/workload" });
    applied++;
  }

  await prisma.workloadProposal.update({ where: { id }, data: { status: "APPLIED", reviewedById: scope.userId, reviewedAt: new Date() } });
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: `Approved workload proposal: ${applied} reassignment(s) applied`, entity: "WorkloadProposal", entityId: id, newValue: { applied, skipped } },
  });
  revalidatePath("/workload");
  revalidatePath("/scheduler");
  return { ok: true, data: { applied, skipped } };
}

export async function rejectProposalAction(id: string): Promise<Result> {
  const r = await reviewable(id);
  if ("error" in r) return { ok: false, error: r.error! };
  await prisma.workloadProposal.update({ where: { id }, data: { status: "REJECTED", reviewedById: r.scope.userId, reviewedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: r.scope.userId, action: "Rejected workload proposal", entity: "WorkloadProposal", entityId: id } });
  revalidatePath("/workload");
  return { ok: true, data: undefined };
}
