"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { PUBLISH_ROLES } from "@/lib/permissions/roles";
import { decideSubmissions } from "@/lib/scheduler/submissions";
import { reviewRequestAction } from "@/app/(dashboard)/requests/actions";
import { reviewProposalAction } from "@/app/(dashboard)/calendar/proposals/actions";
import { approveProposalAction, rejectProposalAction } from "@/app/(dashboard)/workload/actions";

const inputSchema = z.object({
  kind: z.enum(["CLASS_SCHEDULE", "EXAMINATION", "SCHEDULE_REQUEST", "ACTIVITY_PROPOSAL", "WORKLOAD_FIX"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
  decision: z.enum(["APPROVE", "PUBLISH", "REJECT", "REQUEST_CHANGES"]),
  reason: z.string().trim().max(500).optional(),
}).refine((value) => value.decision === "APPROVE" || value.decision === "PUBLISH" || !!value.reason, { message: "A reason is required for rejection or requested changes." });

type Result = { ok: true; count: number } | { ok: false; error: string };

export async function bulkReviewAction(input: z.input<typeof inputSchema>): Promise<Result> {
  const scope = await requireScope("SUPER_ADMINISTRATOR", "REGISTRAR");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the review decision." };
  const { kind, ids, decision, reason } = parsed.data;
  // Only the Super Administrator approves class and examination schedules; the Registrar views them.
  if ((kind === "CLASS_SCHEDULE" || kind === "EXAMINATION") && !PUBLISH_ROLES.includes(scope.role)) return { ok: false, error: "Only the Super Administrator can approve schedules." };

  if (kind === "CLASS_SCHEDULE" || kind === "EXAMINATION") {
    // Ids are whole timetable submissions; Request changes returns the timetable to the Head of Department.
    const count = await decideSubmissions(ids, decision === "REQUEST_CHANGES" ? "RETURN" : decision, scope.userId, reason);
    refresh();
    return { ok: true, count };
  }
  if (decision === "PUBLISH") return { ok: false, error: "Only timetables are published from here." };

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