import "server-only";
import type { ExaminationType, Prisma, SubmissionKind, TimetableSubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notifyFaculty, notifyUsers } from "@/lib/notify";
import { notifyExamParticipants } from "@/lib/examinations/notify";
import { EXAM_TYPE_LABELS } from "@/lib/examinations/types";
import { formatRange } from "@/lib/scheduler/timetable";

/** Whole-timetable submissions: a department's class or examination timetable is sent, decided, and published as one package. */

/** While waiting for a decision or for publication, the timetable cannot be edited. */
export const LOCKED_STATUSES: TimetableSubmissionStatus[] = ["SUBMITTED", "APPROVED"];

export const SUBMISSION_LABEL: Record<TimetableSubmissionStatus, string> = {
  SUBMITTED: "Waiting for approval",
  APPROVED: "Approved, not yet published",
  PUBLISHED: "Published",
  RETURNED: "Returned for revision",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const LOCKED_MESSAGE = "This timetable is waiting for the Registrar's decision and cannot be changed until it is returned or withdrawn.";

export type SubmissionDecision = "APPROVE" | "PUBLISH" | "RETURN" | "REJECT";

/** One row of a submission snapshot; the same id across versions lets changes be listed. */
export interface SnapshotRow { id: string; section: string; subject: string; when: string; room: string; person: string }

type SubmissionCreation =
  | { ok: true; submission: Awaited<ReturnType<typeof prisma.timetableSubmission.create>> }
  | { ok: false; error: string };

class SubmissionRowsChanged extends Error {}

/** Readable name of a submission, for example "College of Computer Studies class timetable, version 2". */
export function submissionTitle(s: { kind: SubmissionKind; examType: ExaminationType | null; version: number; department: { name: string } }) {
  const what = s.kind === "EXAMINATION" ? `${s.examType ? EXAM_TYPE_LABELS[s.examType] : ""} examination timetable`.trim() : "class timetable";
  return `${s.department.name} ${what}, version ${s.version}`;
}

/** The open submission that locks a section's classes (or one examination period) for a term, if any. */
export async function lockingSubmission(sectionId: string, semesterId: string, exam?: ExaminationType) {
  const section = await prisma.section.findUnique({ where: { id: sectionId }, select: { departmentId: true } });
  if (!section?.departmentId) return null;
  return prisma.timetableSubmission.findFirst({
    where: { departmentId: section.departmentId, semesterId, status: { in: LOCKED_STATUSES }, kind: exam ? "EXAMINATION" : "CLASS", ...(exam ? { examType: exam } : {}) },
    select: { id: true },
  });
}

export async function notifyScheduleApprovers(msg: { title: string; message: string; link: string }) {
  const users = await prisma.user.findMany({ where: { role: "REGISTRAR", status: "ACTIVE", archivedAt: null }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), msg);
}

const DAY = (d: string) => d.charAt(0) + d.slice(1).toLowerCase();

/** Rows of the classes or examinations in a submission, as stored in its snapshot and shown on the review page. */
export async function submissionRows(id: string, kind: SubmissionKind): Promise<SnapshotRow[]> {
  if (kind === "EXAMINATION") {
    const rows = await prisma.examination.findMany({
      where: { submissionId: id }, orderBy: [{ date: "asc" }, { startMin: "asc" }],
      include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomName: true } }, proctor: { select: { fullName: true } } },
    });
    return rows.map((e) => ({ id: e.id, section: e.section.name, subject: e.subject.code, when: `${e.date.toISOString().slice(0, 10)}, ${formatRange(e.startMin, e.endMin)}`, room: e.room.roomName, person: e.proctor.fullName }));
  }
  const rows = await prisma.schedule.findMany({
    where: { submissionId: id }, orderBy: [{ sectionId: "asc" }, { dayOfWeek: "asc" }, { startMin: "asc" }],
    include: { subject: { select: { code: true } }, section: { select: { name: true } }, room: { select: { roomName: true } }, faculty: { select: { fullName: true } } },
  });
  return rows.map((e) => ({ id: e.id, section: e.section.name, subject: `${e.subject.code}${e.component === "LABORATORY" ? " (Laboratory)" : ""}`, when: `${DAY(e.dayOfWeek)}, ${formatRange(e.startMin, e.endMin)}`, room: e.room.roomName, person: e.faculty.fullName }));
}

/**
 * Creates a submission for one department and term, moves the given rows to review, and stores a snapshot.
 * The period row is locked with the submission transaction, so closing the window cannot race a submission.
 */
export async function createSubmission(input: { kind: SubmissionKind; examType?: ExaminationType; departmentId: string; semesterId: string; ids: string[]; linkIds?: string[]; userId: string; overrideReason?: string | null }): Promise<SubmissionCreation> {
  const key = { departmentId: input.departmentId, semesterId: input.semesterId, kind: input.kind, ...(input.examType ? { examType: input.examType } : {}) };
  let created: SubmissionCreation;
  try {
    created = await prisma.$transaction(async (tx): Promise<SubmissionCreation> => {
    const now = new Date();
    const activePeriods = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "SchedulingPeriod"
      WHERE "semesterId" = ${input.semesterId}
        AND "kind" = ${input.kind === "EXAMINATION" ? "EXAMINATION" : "CLASS_TIMETABLE"}::"SchedulingPeriodKind"
        AND "status" = 'OPEN'::"SchedulingPeriodStatus"
        AND "startsAt" <= ${now}
        AND "endsAt" >= ${now}
      FOR UPDATE
    `;
    if (!activePeriods.length) {
      const label = input.kind === "EXAMINATION" ? "examination" : "class timetable";
      return { ok: false, error: `The ${label} submission period closed before the timetable could be submitted. Contact the Registrar.` };
    }
    if (await tx.timetableSubmission.count({ where: { ...key, status: { in: LOCKED_STATUSES } } })) {
      return { ok: false, error: "A timetable for this term is already waiting for the Registrar's decision." };
    }
    const version = (await tx.timetableSubmission.count({ where: key })) + 1;
    const created = await tx.timetableSubmission.create({ data: { ...key, version, classCount: input.ids.length, submittedById: input.userId, overrideReason: input.overrideReason ?? null } });
    const where = { id: { in: input.ids }, status: { in: ["DRAFT", "REVIEW"] as ("DRAFT" | "REVIEW")[] } };
    const moved = input.kind === "EXAMINATION"
      ? await tx.examination.updateMany({ where, data: { status: "REVIEW", submittedAt: now, submissionId: created.id } })
      : await tx.schedule.updateMany({ where, data: { status: "REVIEW", submissionId: created.id } });
    if (moved.count !== input.ids.length) throw new SubmissionRowsChanged("The selected timetable rows changed before submission.");
    if (input.linkIds?.length) await tx.schedule.updateMany({ where: { id: { in: input.linkIds }, status: "PUBLISHED" }, data: { submissionId: created.id } });
    return { ok: true, submission: created };
    });
  } catch (error) {
    if (error instanceof SubmissionRowsChanged) return { ok: false, error: error.message };
    throw error;
  }
  if (!created.ok) return created;
  const snapshot = await submissionRows(created.submission.id, input.kind);
  const submission = await prisma.timetableSubmission.update({
    where: { id: created.submission.id },
    data: { snapshot: snapshot as unknown as Prisma.InputJsonValue, classCount: snapshot.length },
  });
  return { ok: true, submission };
}

/** Added, removed, and changed rows compared with the previous version of the same timetable. */
export async function submissionChanges(s: { id: string; departmentId: string; semesterId: string; kind: SubmissionKind; examType: ExaminationType | null; version: number; snapshot: Prisma.JsonValue }) {
  if (s.version < 2) return null;
  const previous = await prisma.timetableSubmission.findFirst({
    where: { departmentId: s.departmentId, semesterId: s.semesterId, kind: s.kind, examType: s.examType, version: { lt: s.version } }, orderBy: { version: "desc" }, select: { version: true, snapshot: true },
  });
  if (!previous) return null;
  const before = new Map(((previous.snapshot ?? []) as unknown as SnapshotRow[]).map((r) => [r.id, r]));
  const now = (s.snapshot ?? []) as unknown as SnapshotRow[];
  const after = new Set(now.map((r) => r.id));
  const changed = now.flatMap((r) => {
    const b = before.get(r.id);
    if (!b) return [];
    const what = [b.when !== r.when && `time ${b.when} to ${r.when}`, b.room !== r.room && `room ${b.room} to ${r.room}`, b.person !== r.person && `${b.person} to ${r.person}`].filter(Boolean);
    return what.length ? [{ row: r, what: what.join("; ") }] : [];
  });
  return { previousVersion: previous.version, added: now.filter((r) => !before.has(r.id)), removed: [...before.values()].filter((r) => !after.has(r.id)), changed };
}

/** The Head of Department pulls back a submission nobody has decided on yet; its rows become drafts again. */
export async function withdrawSubmission(id: string, departmentIds: string[], userId: string) {
  const s = await prisma.timetableSubmission.findFirst({ where: { id, status: "SUBMITTED", departmentId: { in: departmentIds } } });
  if (!s) return false;
  await prisma.$transaction(async (tx) => {
    await tx.timetableSubmission.update({ where: { id }, data: { status: "WITHDRAWN", decidedAt: new Date(), decidedById: userId } });
    const where = { submissionId: id, status: "REVIEW" as const };
    if (s.kind === "EXAMINATION") await tx.examination.updateMany({ where, data: { status: "DRAFT" } });
    else await tx.schedule.updateMany({ where, data: { status: "DRAFT" } });
  });
  await prisma.auditLog.create({ data: { userId, action: `Withdrew timetable submission version ${s.version}`, entity: "TimetableSubmission", entityId: id } });
  return true;
}

/**
 * Applies the Registrar's decision to whole submissions. Approve keeps the timetable locked
 * (optionally until publishAt), Publish makes it live, Return and Reject send every row back to draft.
 */
export async function decideSubmissions(ids: string[], decision: SubmissionDecision, userId: string | null, reason?: string, publishAt?: Date) {
  const open = await prisma.timetableSubmission.findMany({
    where: { id: { in: ids }, status: { in: decision === "PUBLISH" ? ["APPROVED"] : ["SUBMITTED"] } },
    include: { department: { select: { name: true } } },
  });
  const status: TimetableSubmissionStatus = decision === "APPROVE" ? "APPROVED" : decision === "PUBLISH" ? "PUBLISHED" : decision === "RETURN" ? "RETURNED" : "REJECTED";
  const decidedAt = new Date();
  let rows = 0;
  for (const s of open) {
    const back = decision === "RETURN" || decision === "REJECT";
    rows += await prisma.$transaction(async (tx) => {
      await tx.timetableSubmission.update({
        where: { id: s.id },
        // A scheduled publish keeps the approver; the automatic release only changes the status.
        data: { status, ...(userId ? { decidedById: userId, decidedAt } : {}), ...(decision !== "PUBLISH" ? { reason: reason ?? null } : {}), ...(decision === "APPROVE" ? { publishAt: publishAt ?? null } : {}) },
      });
      if (decision === "APPROVE") return s.classCount;
      const where = { submissionId: s.id, status: "REVIEW" as const };
      if (s.kind === "EXAMINATION") {
        const note = back ? `${decision === "REJECT" ? "Rejected" : "Changes requested"}: ${reason}` : null;
        return (await tx.examination.updateMany({ where, data: { status: back ? "DRAFT" : "PUBLISHED", reviewedById: userId, reviewedAt: decidedAt, reviewNote: note } })).count;
      }
      return (await tx.schedule.updateMany({ where, data: { status: back ? "DRAFT" : "PUBLISHED" } })).count;
    });
    const label = submissionTitle(s);
    const when = publishAt ? ` on ${publishAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}` : " by the Registrar";
    const message = decision === "APPROVE" ? `${label} was approved and will be published${when}.`
      : decision === "PUBLISH" ? `${label} is published and visible to faculty and students.`
      : `${label} was ${decision === "RETURN" ? "returned for revision" : "rejected"}: ${reason}`;
    await notifyUsers([s.submittedById], { title: `Timetable ${decision === "RETURN" ? "returned" : status.toLowerCase()}`, message, link: s.kind === "EXAMINATION" ? "/scheduler?mode=examinations" : "/scheduler", type: back ? "WARNING" : "INFO" });
    if (decision === "PUBLISH") await announce(s.id, s.kind, s.department.name, userId);
  }
  if (open.length) await prisma.auditLog.create({ data: { userId, action: `${decision} ${open.length} timetable submission(s) with ${rows} row(s)${reason ? `: ${reason}` : ""}`, entity: "TimetableSubmission" } });
  return open.length;
}

/** Tells faculty (and, for examinations, proctors and students) that the published timetable is live. */
async function announce(id: string, kind: SubmissionKind, department: string, userId: string | null) {
  if (kind === "EXAMINATION") {
    const exams = await prisma.examination.findMany({ where: { submissionId: id } });
    await Promise.all(exams.map((e) => notifyExamParticipants({ ...e, date: e.date.toISOString().slice(0, 10) }, "SCHEDULED", { actorUserId: userId ?? undefined })));
    return;
  }
  const classes = await prisma.schedule.findMany({ where: { submissionId: id }, select: { facultyId: true, sectionId: true }, distinct: ["facultyId", "sectionId"] });
  const students = await prisma.student.findMany({
    where: { sectionId: { in: [...new Set(classes.map((entry) => entry.sectionId))] }, user: { status: "ACTIVE", archivedAt: null } },
    select: { userId: true },
  });
  const faculty = [...new Set(classes.map((entry) => entry.facultyId))];
  await Promise.all([
    notifyFaculty(faculty, { title: "Timetable published", message: `Your classes in the ${department} timetable are now published.`, link: "/scheduler" }),
    notifyUsers(students.map((student) => student.userId), { title: "Your class schedule is available", message: `The ${department} timetable is now published.`, link: "/student/schedule" }),
  ]);
}

/** Publishes approved timetables whose publish time has passed; called on page loads since there is no scheduler process. */
export async function publishDueSubmissions() {
  const due = await prisma.timetableSubmission.findMany({ where: { status: "APPROVED", publishAt: { lte: new Date() } }, select: { id: true } });
  if (due.length) await decideSubmissions(due.map((d) => d.id), "PUBLISH", null);
  return due.length;
}
