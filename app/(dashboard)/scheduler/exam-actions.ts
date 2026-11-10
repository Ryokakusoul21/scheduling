"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { EXAM_TYPES } from "@/lib/examinations/types";
import { departmentWhere, isForeign } from "@/lib/permissions/department";
import { requireScope, type Scope } from "@/lib/permissions/scope";
import { refuseSection, sectionAccess } from "@/lib/permissions/section-access";
import { loadPlan } from "@/lib/occupancy/load";
import { dayOfWeek, describeClash, findClashes } from "@/lib/occupancy/engine";
import { loadExamContext } from "@/lib/examinations/context";
import { checkExaminations, hasHardConflict, type ExamSlot } from "@/lib/examinations/rules";
import { LOCKED_MESSAGE, createSubmission, lockingSubmission, notifyScheduleApprovers } from "@/lib/scheduler/submissions";
import { submissionPeriodError } from "@/lib/scheduler/periods";
import { notifyExamParticipants } from "@/lib/examinations/notify";

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

const generatedExamSchema = z.object({
  sectionId: z.string().min(1),
  subjectId: z.string().min(1),
  roomId: z.string().min(1),
  proctorId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.number().int().min(0).max(24 * 60),
  endMin: z.number().int().min(0).max(24 * 60),
}).refine((exam) => exam.endMin > exam.startMin);

const generatedBatchSchema = z.object({
  semesterId: z.string().min(1),
  type: z.enum(EXAM_TYPES),
  exams: z.array(generatedExamSchema).min(1).max(500),
});

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

/** Subject and proctor must be in scope; a room of another department can only be requested from the Registrar. */
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
  if (room && isForeign(scope, room.departmentId)) return "That room belongs to another department. Send a schedule request to the Registrar to use it.";
  return null;
}

export async function saveExamAction(input: ExamInput, id?: string, changeReason?: string): Promise<Result> {
  const scope = await requireScope("REGISTRAR", "HEAD_OF_DEPARTMENT");
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid examination details." };
  const d = parsed.data;
  const current = id ? await prisma.examination.findUnique({ where: { id } }) : null;
  if (id && !current) return { ok: false, error: "This examination no longer exists." };
  if (scope.role === "REGISTRAR" && (!current || current.status !== "PUBLISHED")) {
    return { ok: false, error: "The Registrar may correct published examinations. New or draft schedules must be submitted by the department." };
  }
  if (scope.role !== "REGISTRAR" && current?.status === "PUBLISHED") {
    return { ok: false, error: "Published examination schedules are locked. Ask the Registrar to record a documented change." };
  }
  if (current?.status === "REVIEW") return { ok: false, error: LOCKED_MESSAGE };
  if (current?.status === "PUBLISHED" && !changeReason?.trim()) {
    return { ok: false, error: "Document a reason before changing a previously submitted examination." };
  }
  for (const sectionId of [d.sectionId, current?.sectionId]) {
    const access = sectionId ? await sectionAccess(scope, sectionId) : "ok";
    if (access !== "ok") return { ok: false, error: await refuseSection(scope, access, "Examination", id) };
    if (sectionId && (await lockingSubmission(sectionId, d.semesterId, d.type))) return { ok: false, error: LOCKED_MESSAGE };
  }
  const scheduled = await prisma.schedule.count({ where: { semesterId: d.semesterId, sectionId: d.sectionId, subjectId: d.subjectId, status: { not: "ARCHIVED" } } });
  if (!scheduled) return { ok: false, error: "An examination must belong to a class in the class schedule." };
  const blocked = await resourcesAllowed(scope, d);
  if (blocked) return { ok: false, error: blocked };
  const conflicts = await examProblems(scope, d, id);
  if (conflicts.length) return { ok: false, error: conflicts.join(" ") };

  const section = await prisma.section.findUnique({ where: { id: d.sectionId }, select: { departmentId: true } });
  // The Registrar's own saves are official; a Head of Department's edits stay drafts, or return for review once approved.
  const status = scope.role === "REGISTRAR" && current?.status === "PUBLISHED" ? "PUBLISHED" : current?.status === "PUBLISHED" ? "REVIEW" : "DRAFT";
  const data = { ...d, departmentId: section?.departmentId ?? null, date: new Date(`${d.date}T00:00:00Z`), notes: d.notes || null, status } as const;
  const exam = id ? await prisma.examination.update({ where: { id }, data }) : await prisma.examination.create({ data });
  await prisma.auditLog.create({
    data: { userId: scope.userId, role: scope.role, departmentId: data.departmentId, action: id ? "Edited examination" : "Scheduled examination", entity: "Examination", entityId: exam.id, ...(current ? { oldValue: current } : {}), newValue: d, ...(changeReason?.trim() ? { reason: changeReason.trim() } : {}) },
  });
  if (scope.role === "REGISTRAR" && current?.status === "PUBLISHED") {
    await notifyExamParticipants({ ...exam, date: exam.date.toISOString().slice(0, 10) }, "UPDATED", {
      actorUserId: scope.userId,
      previousProctorId: current.proctorId,
      reason: changeReason!.trim(),
    });
  }
  refresh();
  return { ok: true, data: undefined };
}

/** Saves a validated auto-schedule run as department-owned drafts for review and Registrar approval. */
export async function saveGeneratedExamsAction(input: z.infer<typeof generatedBatchSchema>): Promise<Result<{ batchId: string; count: number }>> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const parsed = generatedBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid generated examination schedule." };
  const batch = parsed.data;
  const keys = batch.exams.map((exam) => `${exam.sectionId}|${exam.subjectId}`);
  if (new Set(keys).size !== keys.length) return { ok: false, error: "The generated schedule contains duplicate classes." };

  const term = await prisma.semester.findUnique({ where: { id: batch.semesterId }, select: { id: true } });
  if (!term) return { ok: false, error: "The selected term no longer exists." };

  const sectionIds = [...new Set(batch.exams.map((exam) => exam.sectionId))];
  const [sections, schedules, existing, rooms, proctors] = await Promise.all([
    prisma.section.findMany({
      where: { AND: [departmentWhere.section(scope), { id: { in: sectionIds }, semesterId: batch.semesterId, archivedAt: null }] },
      select: { id: true, name: true, departmentId: true, studentCount: true },
    }),
    prisma.schedule.findMany({
      where: { AND: [departmentWhere.schedule(scope), { semesterId: batch.semesterId, sectionId: { in: sectionIds }, status: { not: "ARCHIVED" } }] },
      select: { sectionId: true, subjectId: true, facultyId: true },
    }),
    prisma.examination.findMany({
      where: { semesterId: batch.semesterId, type: batch.type, sectionId: { in: sectionIds }, status: { not: "ARCHIVED" } },
      select: { sectionId: true, subjectId: true },
    }),
    prisma.room.findMany({
      where: { id: { in: [...new Set(batch.exams.map((exam) => exam.roomId))] } },
      select: { id: true, departmentId: true, capacity: true, status: true, archivedAt: true, availability: { select: { dayOfWeek: true, startMin: true, endMin: true } } },
    }),
    prisma.faculty.findMany({
      where: { id: { in: [...new Set(batch.exams.map((exam) => exam.proctorId))] }, status: "ACTIVE", archivedAt: null },
      select: { id: true, employmentType: true, dayOff: true, availability: { select: { dayOfWeek: true, startMin: true, endMin: true } } },
    }),
  ]);
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const proctorById = new Map(proctors.map((proctor) => [proctor.id, proctor]));
  const scheduleByClass = new Map<string, string[]>();
  for (const row of schedules) {
    const key = `${row.sectionId}|${row.subjectId}`;
    scheduleByClass.set(key, [...(scheduleByClass.get(key) ?? []), row.facultyId]);
  }
  for (const exam of batch.exams) {
    const key = `${exam.sectionId}|${exam.subjectId}`;
    if (!sectionById.has(exam.sectionId) || !scheduleByClass.get(key)?.includes(exam.proctorId)) {
      return { ok: false, error: "A generated examination no longer matches an editable scheduled class in this department." };
    }
    const room = roomById.get(exam.roomId);
    if (!room || room.status !== "AVAILABLE" || room.archivedAt || isForeign(scope, room.departmentId)) {
      return { ok: false, error: "A proposed room is unavailable or belongs to another department. Refresh the schedule and generate again." };
    }
    if (room.capacity < sectionById.get(exam.sectionId)!.studentCount) {
      return { ok: false, error: "A proposed room is too small for its section. Refresh the schedule and generate again." };
    }
    const proctor = proctorById.get(exam.proctorId);
    if (!proctor) return { ok: false, error: "A proposed proctor is inactive. Refresh the schedule and generate again." };
    const day = dayOfWeek(exam.date);
    if ((proctor.employmentType === "PART_TIME" && proctor.dayOff === day) || (proctor.availability.length && !proctor.availability.some((window) => window.dayOfWeek === day && window.startMin <= exam.startMin && window.endMin >= exam.endMin))) {
      return { ok: false, error: "A proposed proctor is unavailable at the generated time. Refresh the schedule and generate again." };
    }
    if (room.availability.length && !room.availability.some((window) => window.dayOfWeek === day && window.startMin <= exam.startMin && window.endMin >= exam.endMin)) {
      return { ok: false, error: "A proposed room is unavailable at the generated time. Refresh the schedule and generate again." };
    }
    if (existing.some((row) => row.sectionId === exam.sectionId && row.subjectId === exam.subjectId)) {
      return { ok: false, error: "An examination for one of these classes already exists. Refresh the schedule and generate again." };
    }
    if (await lockingSubmission(exam.sectionId, batch.semesterId, batch.type)) return { ok: false, error: LOCKED_MESSAGE };
  }

  const scheduledForTerm = new Set(schedules.map((row) => `${row.sectionId}|${row.subjectId}`));
  if (keys.some((key) => !scheduledForTerm.has(key))) return { ok: false, error: "A generated examination no longer belongs to the selected term." };

  const from = batch.exams.map((exam) => exam.date).sort()[0];
  const to = batch.exams.map((exam) => exam.date).sort().at(-1)!;
  const [plan, official] = await Promise.all([
    loadPlan(from, to),
    loadExamContext(batch.type, null, scope.departmentIds),
  ]);
  if (!official.window) return { ok: false, error: "There is no approved examination window for this period." };

  const slots: ExamSlot[] = batch.exams.map((exam, index) => ({
    id: `generated-${index}`,
    date: exam.date,
    startMin: exam.startMin,
    endMin: exam.endMin,
    sectionId: exam.sectionId,
    roomId: exam.roomId,
    proctorId: exam.proctorId,
  }));
  const roomCapacity = new Map(rooms.map((room) => [room.id, room.capacity]));
  const sectionSize = new Map(sections.map((section) => [section.id, section.studentCount]));
  const existingExaminations = plan.ctx.occupants
    .filter((occupant) => occupant.kind === "EXAMINATION")
    .flatMap((occupant) => occupant.roomId === null ? [] : [{
      id: occupant.refId,
      date: occupant.date,
      startMin: occupant.startMin,
      endMin: occupant.endMin,
      sectionId: occupant.sectionIds[0] ?? "",
      roomId: occupant.roomId,
      proctorId: occupant.facultyIds[0] ?? "",
    }]);
  const issues = checkExaminations(slots, {
    window: official.window,
    blockedDates: official.blockedDates,
    roomCapacity,
    sectionSize,
    busy: existingExaminations,
  });
  if (hasHardConflict(issues)) return { ok: false, error: `Resolve generated examination conflicts before saving: ${issues.find((issue) => issue.severity === "conflict")?.message}` };

  for (let index = 0; index < batch.exams.length; index += 1) {
    const exam = batch.exams[index];
    const slot = slots[index];
    const room = plan.ctx.rooms.find((item) => item.id === exam.roomId);
    if (!room || room.status !== "AVAILABLE") return { ok: false, error: "A proposed room is no longer available. Refresh the schedule and generate again." };
    if (!plan.ctx.faculty.has(exam.proctorId)) return { ok: false, error: "A proposed proctor is no longer active. Refresh the schedule and generate again." };
    const clashes = findClashes(plan.ctx.occupants, {
      date: slot.date,
      startMin: slot.startMin,
      endMin: slot.endMin,
      roomId: slot.roomId,
      facultyIds: [slot.proctorId],
      sectionIds: [slot.sectionId],
    });
    if (clashes.length) return { ok: false, error: `${describeClash(clashes[0])} Refresh the schedule and generate again.` };
    if (plan.ctx.unavailable.some((unavailable) =>
      (unavailable.facultyId === exam.proctorId || unavailable.roomId === exam.roomId) &&
      slot.date >= unavailable.start && slot.date <= unavailable.end &&
      (unavailable.startMin == null || unavailable.endMin == null || (slot.startMin < unavailable.endMin && unavailable.startMin < slot.endMin))
    )) return { ok: false, error: "A proposed room or proctor became unavailable. Refresh the schedule and generate again." };
  }

  const saved = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.examBatch.create({
      data: {
        semesterId: batch.semesterId,
        type: batch.type,
        departmentId: scope.departmentId,
        createdById: scope.userId,
        explanation: "Generated in academic level and year or grade order using the approved examination window, room capacity, and conflict rules. Review before submitting to the Registrar.",
      },
    });
    const created = [];
    for (const exam of batch.exams) {
      const section = sectionById.get(exam.sectionId)!;
      created.push(await tx.examination.create({
        data: {
          ...exam,
          semesterId: batch.semesterId,
          type: batch.type,
          departmentId: section.departmentId ?? scope.departmentId,
          date: new Date(`${exam.date}T00:00:00Z`),
          notes: "Generated automatically; review before submitting.",
          batchId: createdBatch.id,
          status: "DRAFT",
        },
      }));
    }
    await tx.auditLog.create({
      data: {
        userId: scope.userId,
        role: scope.role,
        departmentId: scope.departmentId,
        action: `Generated ${created.length} examination draft(s)`,
        entity: "ExamBatch",
        entityId: createdBatch.id,
        newValue: { semesterId: batch.semesterId, type: batch.type, examinationIds: created.map((exam) => exam.id) },
      },
    });
    return { batchId: createdBatch.id, count: created.length };
  });
  refresh();
  return { ok: true, data: saved };
}

const moveSchema = z.object({ id: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startMin: z.number().int().min(0), endMin: z.number().int().max(24 * 60) });

/** Drag-and-drop move: changes only the date and time, with the same checks as a save. */
export async function moveExamAction(input: z.infer<typeof moveSchema>, changeReason?: string): Promise<Result> {
  await requireScope("REGISTRAR", "HEAD_OF_DEPARTMENT");
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success || parsed.data.endMin <= parsed.data.startMin) return { ok: false, error: "Invalid move." };
  const { id, ...slot } = parsed.data;
  const e = await prisma.examination.findUnique({ where: { id } });
  if (!e) return { ok: false, error: "This examination no longer exists." };
  return saveExamAction({ semesterId: e.semesterId, sectionId: e.sectionId, subjectId: e.subjectId, roomId: e.roomId, proctorId: e.proctorId, type: e.type, notes: e.notes ?? undefined, ...slot }, id, changeReason);
}

/** Removes the examination slot; the class returns to the Unscheduled tab because that list is derived from what is placed. */
export async function removeExamAction(id: string, reason?: string): Promise<Result> {
  const scope = await requireScope("REGISTRAR", "HEAD_OF_DEPARTMENT");
  const exam = await prisma.examination.findUnique({ where: { id } });
  if (!exam) return { ok: true, data: undefined };
  const access = await sectionAccess(scope, exam.sectionId);
  if (access !== "ok") return { ok: false, error: await refuseSection(scope, access, "Examination", id) };
  if ((exam.status === "PUBLISHED" || exam.status === "REVIEW") && scope.role !== "REGISTRAR") return { ok: false, error: "Only the Registrar can remove a published examination. Submit other changes for review." };
  if (scope.role === "REGISTRAR" && exam.status !== "PUBLISHED") return { ok: false, error: "The Registrar may remove a published examination. Department drafts must be managed by the department." };
  if ((exam.status === "PUBLISHED" || exam.status === "REVIEW") && !reason?.trim()) return { ok: false, error: "Document a reason before removing this submitted examination." };
  if (await lockingSubmission(exam.sectionId, exam.semesterId, exam.type)) return { ok: false, error: LOCKED_MESSAGE };
  if (exam.status === "PUBLISHED") {
    await notifyExamParticipants({ ...exam, date: exam.date.toISOString().slice(0, 10) }, "CANCELLED", { actorUserId: scope.userId, reason: reason!.trim() });
  }
  await prisma.examination.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: exam.departmentId, action: "Moved examination to Unscheduled", entity: "Examination", entityId: id, oldValue: exam, ...(reason?.trim() ? { reason: reason.trim() } : {}) } });
  refresh();
  return { ok: true, data: undefined };
}

/** Sends the department's draft examinations to the Registrar as one listing; blocked while hard conflicts remain. */
export async function submitExamsAction(ids: string[]): Promise<Result<{ count: number }>> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const parsed = z.array(z.string().min(1)).min(1).max(1000).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select at least one examination." };
  const selected = await prisma.examination.findMany({
    where: { id: { in: parsed.data }, ...departmentWhere.examination(scope), status: { in: ["DRAFT", "REVIEW"] } },
    include: { section: { select: { studentCount: true, name: true, departmentId: true } }, room: { select: { capacity: true } } },
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
  // One package per department, term, and examination period.
  const groups = new Map<string, { departmentId: string; semesterId: string; examType: (typeof selected)[number]["type"]; ids: string[] }>();
  for (const e of selected) {
    const departmentId = e.section.departmentId ?? scope.departmentId;
    if (!departmentId) return { ok: false, error: "This section has no department, so its examinations cannot be submitted." };
    const key = `${departmentId}:${e.semesterId}:${e.type}`;
    const g = groups.get(key) ?? { departmentId, semesterId: e.semesterId, examType: e.type, ids: [] };
    g.ids.push(e.id);
    groups.set(key, g);
  }
  for (const semesterId of new Set(selected.map((exam) => exam.semesterId))) {
    const closed = await submissionPeriodError(semesterId, "EXAMINATION");
    if (closed) return { ok: false, error: closed };
  }
  let count = 0;
  for (const g of groups.values()) {
    const created = await createSubmission({ kind: "EXAMINATION", ...g, userId: scope.userId });
    if ("error" in created) return { ok: false, error: `${count ? `${count} examination(s) were submitted. ` : ""}${created.error}` };
    count += created.submission.classCount;
  }
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: scope.departmentId, action: `Submitted ${count} examination(s) for Registrar approval`, entity: "Examination" } });
  await notifyScheduleApprovers({ title: "Examination timetable submitted", message: `${count} examination(s) in ${groups.size} timetable(s) await your decision.`, link: "/admin/review-center?queue=examinations" });
  refresh();
  revalidatePath("/admin/review-center");
  return { ok: true, data: { count } };
}
