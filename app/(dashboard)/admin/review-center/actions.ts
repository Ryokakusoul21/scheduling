"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { notifyManagers } from "@/lib/notify";
import { notifyExamParticipants } from "@/lib/examinations/notify";
import { requireScope } from "@/lib/permissions/scope";
import { reviewRequestAction } from "@/app/(dashboard)/requests/actions";
import { reviewProposalAction } from "@/app/(dashboard)/calendar/proposals/actions";
import { approveProposalAction, rejectProposalAction } from "@/app/(dashboard)/workload/actions";

const inputSchema = z.object({
  kind: z.enum(["CLASS_SCHEDULE", "EXAMINATION", "SCHEDULE_REQUEST", "ACTIVITY_PROPOSAL", "WORKLOAD_FIX"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
  reason: z.string().trim().max(500).optional(),
}).refine((value) => value.decision === "APPROVE" || !!value.reason, { message: "A reason is required for rejection or requested changes." });

type Result = { ok: true; count: number } | { ok: false; error: string };

export async function bulkReviewAction(input: z.input<typeof inputSchema>): Promise<Result> {
  const scope = await requireScope("SUPER_ADMINISTRATOR", "REGISTRAR");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the review decision." };
  const { kind, ids, decision, reason } = parsed.data;

  if (kind === "CLASS_SCHEDULE") {
    const schedules = await prisma.schedule.findMany({ where: { id: { in: ids }, status: "REVIEW" }, select: { id: true, notes: true } });
    await prisma.$transaction(schedules.map((schedule) => prisma.schedule.update({
      where: { id: schedule.id },
      data: decision === "APPROVE"
        ? { status: "PUBLISHED" }
        : { status: "DRAFT", notes: [schedule.notes, `${decision === "REJECT" ? "Rejected" : "Changes requested"}: ${reason}`].filter(Boolean).join("\n") },
    })));
    await prisma.auditLog.create({ data: { userId: scope.userId, action: `${decision.replace("_", " ")} ${schedules.length} class schedule(s)${reason ? `: ${reason}` : ""}`, entity: "Schedule" } });
    refresh();
    return { ok: true, count: schedules.length };
  }

  if (kind === "EXAMINATION") {
    const exams = await prisma.examination.findMany({ where: { id: { in: ids }, status: "REVIEW" } });
    const reviewedAt = new Date();
    await prisma.$transaction(exams.map((exam) => prisma.examination.update({
      where: { id: exam.id },
      // Rejected or returned rows go back to the Head of Department as drafts with the reason attached.
      data: decision === "APPROVE"
        ? { status: "PUBLISHED", reviewedById: scope.userId, reviewedAt, reviewNote: null }
        : { status: "DRAFT", reviewedById: scope.userId, reviewedAt, reviewNote: `${decision === "REJECT" ? "Rejected" : "Changes requested"}: ${reason}` },
    })));
    if (decision === "APPROVE") {
      // Only approved examinations reach proctors, instructors, and students.
      await Promise.all(exams.map((exam) => notifyExamParticipants({ ...exam, date: exam.date.toISOString().slice(0, 10) }, "SCHEDULED", { actorUserId: scope.userId })));
    } else {
      await notifyManagers(null, { title: decision === "REJECT" ? "Examinations rejected" : "Examination changes requested", message: reason ?? "", link: "/scheduler?mode=examinations", type: "WARNING" });
    }
    await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, action: `${decision.replace("_", " ")} ${exams.length} examination(s)${reason ? `: ${reason}` : ""}`, entity: "Examination" } });
    refresh();
    return { ok: true, count: exams.length };
  }

  let count = 0;
  for (const id of ids) {
    const result = kind === "SCHEDULE_REQUEST"
      ? decision === "REQUEST_CHANGES"
        ? { ok: false as const, error: "Schedule requests can be approved or rejected." }
        : await reviewRequestAction(id, decision === "APPROVE" ? "APPROVED" : "REJECTED", reason)
      : kind === "ACTIVITY_PROPOSAL"
        ? await reviewProposalAction({ proposalId: id, decision: decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED", note: reason })
        : decision === "REQUEST_CHANGES"
          ? { ok: false as const, error: "Workload fixes can be approved or rejected." }
          : await reviewWorkload(id, decision === "APPROVE", reason);
    if (!result.ok) return { ok: false, error: `${count} item(s) completed. ${result.error}` };
    count++;
  }
  refresh();
  return { ok: true, count };
}

/** Whole-proposal workload review from the review center, at the proposal's current version. */
async function reviewWorkload(id: string, approve: boolean, reason?: string) {
  const version = (await prisma.workloadProposal.findUnique({ where: { id }, select: { version: true } }))?.version ?? 0;
  return approve ? approveProposalAction({ proposalId: id, version }) : rejectProposalAction({ proposalId: id, version, reason });
}

function refresh() {
  revalidatePath("/admin/review-center");
  revalidatePath("/scheduler");
  revalidatePath("/requests");
  revalidatePath("/calendar/proposals");
  revalidatePath("/workload");
}