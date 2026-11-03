"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { EXAM_TYPES } from "@/lib/examinations/types";
import { departmentWhere, isForeign } from "@/lib/permissions/department";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope, type Scope } from "@/lib/permissions/scope";
import { refuseSection, sectionAccess } from "@/lib/permissions/section-access";
import { loadPlan } from "@/lib/occupancy/load";
import { describeClash, findClashes } from "@/lib/occupancy/engine";
import { loadExamContext } from "@/lib/examinations/context";
import { checkExaminations, hasHardConflict, type ExamSlot } from "@/lib/examinations/rules";
import { notifyManagers } from "@/lib/notify";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const examSchema = z
  .object({
    semesterId: z.string().min(1, "Choose a term"),
    sectionId: z.string().min(1, "Choose a section"),
    subjectId: z.string().min(1, "Choose a subject"),
    roomId: z.string().min(1, "Choose a room"),
    proctorId: z.string().min(1, "Choose a proctor"),
    type: z.enum(EXAM_TYPES),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    notes: z.string().max(300).optional(),
  })
  .refine((d) => d.endMin > d.startMin, { message: "End time must be after start time" });

export type ExamInput = z.infer<typeof examSchema>;

const refresh = () => {
  revalidatePath("/scheduler");
  revalidatePath("/calendar");
};

/** Hard conflicts of a proposed examination: occupancy clashes, capacity, the official window, and blocked dates. */
async function examProblems(scope: Scope, d: ExamInput, excludeId?: string) {
  const [plan, section, room, context] = await Promise.all([
    loadPlan(d.date, d.date),
    prisma.section.findUnique({ where: { id: d.sectionId }, select: { studentCount: true, name: true, level: true, archivedAt: true } }),
    prisma.room.findUnique({ where: { id: d.roomId }, select: { capacity: true, roomName: true, status: true, archivedAt: true } }),
    loadExamContext(d.type, null, scope.isAdmin ? null : scope.departmentIds),
  ]);
  const conflicts = findClashes(
    plan.ctx.occupants,
    { date: d.date, startMin: d.startMin, endMin: d.endMin, roomId: d.roomId, facultyIds: [d.proctorId], sectionIds: [d.sectionId] },
    (o) => o.kind === "EXAMINATION" && o.refId === excludeId
  ).map(describeClash);
  if (room?.status !== "AVAILABLE" || room?.archivedAt) conflicts.push(`${room?.roomName ?? "The room"} is not open for use.`);
  if (section?.archivedAt) conflicts.push(`${section.name} is archived.`);
  if (!plan.ctx.faculty.has(d.proctorId)) conflicts.push("The proctor is archived or inactive.");
  if (plan.ctx.unavailable.some((u) => u.facultyId === d.proctorId && d.date >= u.start && d.date <= u.end)) conflicts.push("The proctor reported being unavailable on this date.");
  const slot: ExamSlot = { id: excludeId ?? "new", date: d.date, startMin: d.startMin, endMin: d.endMin, sectionId: d.sectionId, roomId: d.roomId, proctorId: d.proctorId };
  const rule = checkExaminations([slot], {
    window: context.window,
    blockedDates: context.blockedDates,
    roomCapacity: new Map(room ? [[d.roomId, room.capacity]] : []),
    sectionSize: new Map(section ? [[d.sectionId, section.studentCount]] : []),
  });
  conflicts.push(...rule.filter((i) => i.severity === "conflict").map((i) => i.message));
  return conflicts;
}

/** Subject and proctor must be in scope; a room of another department can only be requested from the Administrator. */
async function resourcesAllowed(scope: Scope, d: ExamInput) {
  if (scope.isAdmin) return null;
  const [subject, proctor, room] = await Promise.all([
    prisma.subject.count({ where: { id: d.subjectId, ...departmentWhere.subject(scope) } }),
    prisma.faculty.count({ where: { id: d.proctorId, ...departmentWhere.faculty(scope) } }),
    prisma.room.findUnique({ where: { id: d.roomId }, select: { departmentId: true } }),
  ]);
  // A proctor outside the department is fine when that person teaches the class.
  const teaches = proctor || (await prisma.schedule.count({ where: { semesterId: d.semesterId, sectionId: d.sectionId, subjectId: d.subjectId, facultyId: d.proctorId, status: { not: "ARCHIVED" } } }));
  if (!subject || !teaches) return "Choose a subject and proctor of your department, or the teacher of the class.";
  if (room && isForeign(scope, room.departmentId)) return "That room belongs to another department. Send a schedule request to the Administrator to use it.";
  return null;
}

export async function saveExamAction(input: ExamInput, id?: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid examination details." };
  const d = parsed.data;
  const current = id ? await prisma.examination.findUnique({ where: { id }, select: { sectionId: true, status: true, proctorId: true } }) : null;
  if (id && !current) return { ok: false, error: "This examination no longer exists." };
  for (const sectionId of [d.sectionId, current?.sectionId]) {
    const access = sectionId ? await sectionAccess(scope, sectionId) : "ok";
    if (access !== "ok") return { ok: false, error: await refuseSection(scope, access, "Examination", id) };
  }
  const scheduled = await prisma.schedule.count({ where: { semesterId: d.semesterId, sectionId: d.sectionId, subjectId: d.subjectId, status: { not: "ARCHIVED" } } });
  if (!scheduled) return { ok: false, error: "An examination must belong to a class in the class schedule." };
  const blocked = await resourcesAllowed(scope, d);
  if (blocked) return { ok: false, error: blocked };
  const conflicts = await examProblems(scope, d, id);
  if (conflicts.length) return { ok: false, error: conflicts.join(" ") };

  const section = await prisma.section.findUnique({ where: { id: d.sectionId }, select: { departmentId: true } });
  // The Administrator's own saves are official; a Head of Department's edits stay drafts, or return for review once approved.
  const status = scope.isAdmin ? "PUBLISHED" : current?.status === "PUBLISHED" ? "REVIEW" : "DRAFT";
  const data = { ...d, departmentId: section?.departmentId ?? null, date: new Date(`${d.date}T00:00:00Z`), notes: d.notes || null, status } as const;
  const exam = id ? await prisma.examination.update({ where: { id }, data }) : await prisma.examination.create({ data });
  await prisma.auditLog.create({
    data: { userId: scope.userId, role: scope.role, departmentId: data.departmentId, action: id ? "Edited examination" : "Scheduled examination", entity: "Examination", entityId: exam.id, newValue: d },
  });
  refresh();
  return { ok: true, data: undefined };
}

const moveSchema = z.object({ id: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startMin: z.number().int().min(0), endMin: z.number().int().max(24 * 60) });

/** Drag-and-drop move: changes only the date and time, with the same checks as a save. */
export async function moveExamAction(input: z.infer<typeof moveSchema>): Promise<Result> {
  await requireScope(...STAFF_ROLES);
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success || parsed.data.endMin <= parsed.data.startMin) return { ok: false, error: "Invalid move." };
  const { id, ...slot } = parsed.data;
  const e = await prisma.examination.findUnique({ where: { id } });
  if (!e) return { ok: false, error: "This examination no longer exists." };
  return saveExamAction({ semesterId: e.semesterId, sectionId: e.sectionId, subjectId: e.subjectId, roomId: e.roomId, proctorId: e.proctorId, type: e.type, notes: e.notes ?? undefined, ...slot }, id);
}

/** Removes the examination slot; the class returns to the Unscheduled tab because that list is derived from what is placed. */
export async function removeExamAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const exam = await prisma.examination.findUnique({ where: { id } });
  if (!exam) return { ok: true, data: undefined };
  const access = await sectionAccess(scope, exam.sectionId);
  if (access !== "ok") return { ok: false, error: await refuseSection(scope, access, "Examination", id) };
  await prisma.examination.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: exam.departmentId, action: "Moved examination to Unscheduled", entity: "Examination", entityId: id, oldValue: exam } });
  refresh();
  return { ok: true, data: undefined };
}

/** Sends the department's draft examinations to the Administrator as one listing; blocked while hard conflicts remain. */
export async function submitExamsAction(ids: string[]): Promise<Result<{ count: number }>> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const parsed = z.array(z.string().min(1)).min(1).max(1000).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select at least one examination." };
  const selected = await prisma.examination.findMany({
    where: { id: { in: parsed.data }, ...departmentWhere.examination(scope), status: "DRAFT" },
    include: { section: { select: { studentCount: true, name: true } }, room: { select: { capacity: true } } },
  });
  if (selected.length !== new Set(parsed.data).size) return { ok: false, error: "One or more examinations were not found or are not drafts." };

  const types = [...new Set(selected.map((e) => e.type))];
  for (const type of types) {
    const rows = selected.filter((e) => e.type === type);
    const ctx = await loadExamContext(type, null, scope.departmentIds);
    const issues = checkExaminations(
      rows.map((e) => ({ id: e.id, date: e.date.toISOString().slice(0, 10), startMin: e.startMin, endMin: e.endMin, sectionId: e.sectionId, roomId: e.roomId, proctorId: e.proctorId })),
      { window: ctx.window, blockedDates: ctx.blockedDates, roomCapacity: new Map(rows.map((e) => [e.roomId, e.room.capacity])), sectionSize: new Map(rows.map((e) => [e.sectionId, e.section.studentCount])) }
    );
    if (hasHardConflict(issues)) return { ok: false, error: `Resolve the conflicts in the ${type.toLowerCase().replace("_", "-")} examinations before submitting.` };
  }
  const { count } = await prisma.examination.updateMany({ where: { id: { in: parsed.data }, status: "DRAFT" }, data: { status: "REVIEW", submittedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: scope.departmentId, action: `Submitted ${count} examination(s) for Administrator review`, entity: "Examination" } });
  await notifyManagers(null, { title: "Examination schedule submitted", message: `${count} examination(s) await your review.`, link: "/admin/review-center?queue=examinations" });
  refresh();
  revalidatePath("/admin/review-center");
  return { ok: true, data: { count } };
}
