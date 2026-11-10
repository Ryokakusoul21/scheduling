"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireScope } from "@/lib/permissions/scope";
import { PUBLISH_ROLES } from "@/lib/permissions/roles";
import { decideSubmissions } from "@/lib/scheduler/submissions";

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
  if (scope.role === "SUPER_ADMINISTRATOR") return { ok: false, error: "The Administrator can inspect academic queues but cannot decide them." };
  // Schedule decisions are available only to final approvers, and apply to submitted packages.
  if ((kind === "CLASS_SCHEDULE" || kind === "EXAMINATION") && !PUBLISH_ROLES.includes(scope.role)) return { ok: false, error: "Only the Registrar can approve schedules." };

  if (kind === "CLASS_SCHEDULE" || kind === "EXAMINATION") {
    // Ids are whole timetable submissions; Request changes returns the timetable to the Head of Department.
    const count = await decideSubmissions(ids, decision === "REQUEST_CHANGES" ? "RETURN" : decision, scope.userId, reason);
    refresh();
    return { ok: true, count };
  }
  return { ok: false, error: "This approval is handled by department heads and is unavailable in the Registrar Review Center." };
}

function refresh() {
  revalidatePath("/admin/review-center");
  revalidatePath("/scheduler");
  revalidatePath("/requests");
  revalidatePath("/calendar/proposals");
  revalidatePath("/workload");
}
