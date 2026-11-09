import type { SubmissionKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { submissionTitle } from "@/lib/scheduler/submissions";
import { SubmissionNotice } from "./submission-notice";

const fmt = (d: Date) => d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
/** Published timetables keep their notice for a week. */
const weekAgo = () => new Date(Date.now() - 7 * 86_400_000);

/** The latest submission of each department timetable in this academic year, for the Head of Department. */
export async function HeadNotices({ departmentIds, academicYearId, kind }: { departmentIds: string[]; academicYearId: string; kind: SubmissionKind }) {
  const recent = weekAgo();
  const rows = await prisma.timetableSubmission.findMany({
    where: { departmentId: { in: departmentIds }, kind, semester: { academicYearId }, OR: [{ status: { not: "PUBLISHED" } }, { decidedAt: { gte: recent } }] },
    include: { department: { select: { name: true } }, comments: { orderBy: { createdAt: "asc" } } },
    orderBy: { version: "desc" },
  });
  const latest = [...new Map(rows.map((x) => [`${x.departmentId}:${x.semesterId}:${x.examType ?? ""}`, x])).values()];
  return (
    <SubmissionNotice
      rows={latest.map((x) => ({
        id: x.id, title: submissionTitle(x), status: x.status, reason: x.reason,
        date: fmt(x.decidedAt ?? x.submittedAt), publishAt: x.publishAt ? fmt(x.publishAt) : null,
        comments: x.comments.map((c) => ({ id: c.id, row: c.rowLabel, body: c.body })),
      }))}
    />
  );
}
