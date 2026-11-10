"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/permissions/scope";
import { PUBLISH_ROLES } from "@/lib/permissions/roles";
import { decideSubmissions, submissionTitle } from "@/lib/scheduler/submissions";
import { notifyUsers } from "@/lib/notify";

type Result = { ok: true } | { ok: false; error: string };

const decisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVE", "PUBLISH", "RETURN", "REJECT"]),
  reason: z.string().trim().max(500).optional(),
  /** Local date and time for a scheduled publish, only with Approve. */
  publishAt: z.string().optional(),
}).refine((v) => v.decision === "APPROVE" || v.decision === "PUBLISH" || !!v.reason, { message: "Give a reason for returning or rejecting." });

/** The Registrar's decision on one whole timetable, with an optional publish date for approvals. */
export async function decideTimetableAction(input: z.input<typeof decisionSchema>): Promise<Result> {
  const scope = await requireScope(...PUBLISH_ROLES);
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the decision." };
  const { id, decision, reason, publishAt } = parsed.data;
  // The browser sends Philippine local time without a zone.
  const when = publishAt ? new Date(`${publishAt}:00+08:00`) : undefined;
  if (when && (Number.isNaN(when.getTime()) || when <= new Date())) return { ok: false, error: "Choose a publish date and time in the future." };
  const count = await decideSubmissions([id], decision, scope.userId, reason, when);
  if (!count) return { ok: false, error: "This timetable was already decided or withdrawn." };
  refresh(id);
  return { ok: true };
}

const commentSchema = z.object({ submissionId: z.string().min(1), rowId: z.string().optional(), rowLabel: z.string().max(200).optional(), body: z.string().trim().min(2).max(1000) });

/** A note for the Head of Department, about the whole timetable or one class or examination. */
export async function addTimetableCommentAction(input: z.input<typeof commentSchema>): Promise<Result> {
  const scope = await requireScope(...PUBLISH_ROLES);
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Write a comment first." };
  const submission = await prisma.timetableSubmission.findUnique({ where: { id: parsed.data.submissionId }, include: { department: { select: { name: true } } } });
  if (!submission) return { ok: false, error: "This timetable no longer exists." };
  await prisma.timetableComment.create({ data: { ...parsed.data, authorId: scope.userId } });
  await notifyUsers([submission.submittedById], { title: "New comment on your timetable", message: `${submissionTitle(submission)}: ${parsed.data.rowLabel ? `${parsed.data.rowLabel}: ` : ""}${parsed.data.body}`, link: submission.kind === "EXAMINATION" ? "/scheduler?mode=examinations" : "/scheduler" });
  refresh(submission.id);
  return { ok: true };
}

function refresh(id: string) {
  revalidatePath(`/admin/review-center/timetables/${id}`);
  revalidatePath("/admin/review-center");
  revalidatePath("/scheduler");
}
