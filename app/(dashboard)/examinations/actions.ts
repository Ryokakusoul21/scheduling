"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope } from "@/lib/permissions/scope";
import { loadPlan } from "@/lib/occupancy/load";
import { describeClash, findClashes } from "@/lib/occupancy/engine";
import { notifyExamParticipants } from "@/lib/examinations/notify";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const examSchema = z
  .object({
    semesterId: z.string().min(1, "Choose a term"),
    sectionId: z.string().min(1, "Choose a section"),
    subjectId: z.string().min(1, "Choose a subject"),
    roomId: z.string().min(1, "Choose a room"),
    proctorId: z.string().min(1, "Choose a proctor"),
    type: z.enum(["PRELIMINARY", "MIDTERM", "FINAL", "SPECIAL"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    notes: z.string().max(300).optional(),
  })
  .refine((d) => d.endMin > d.startMin, { message: "End time must be after start time" });

export type ExamInput = z.infer<typeof examSchema>;

/** Room, proctor, and section conflicts plus capacity and availability warnings for a proposed examination. */
async function examProblems(d: ExamInput, excludeId?: string) {
  const [p, section, room] = await Promise.all([
    loadPlan(d.date, d.date),
    prisma.section.findUnique({ where: { id: d.sectionId }, select: { studentCount: true, name: true, archivedAt: true } }),
    prisma.room.findUnique({ where: { id: d.roomId }, select: { capacity: true, roomName: true, status: true, archivedAt: true } }),
  ]);
  const conflicts = findClashes(
    p.ctx.occupants,
    { date: d.date, startMin: d.startMin, endMin: d.endMin, roomId: d.roomId, facultyIds: [d.proctorId], sectionIds: [d.sectionId] },
    (o) => o.kind === "EXAMINATION" && o.refId === excludeId
  ).map(describeClash);
  const warnings: string[] = [];
  if (room && section && room.capacity < section.studentCount) conflicts.push(`${room.roomName} seats ${room.capacity} but ${section.name} has ${section.studentCount} students.`);
  if (room && room.status !== "AVAILABLE") conflicts.push(`${room.roomName} is not open for use.`);
  if (room?.archivedAt) conflicts.push(`${room.roomName} is archived.`);
  if (section?.archivedAt) conflicts.push(`${section.name} is archived.`);
  if (!p.ctx.faculty.has(d.proctorId)) conflicts.push("The proctor is archived or inactive.");
  if (p.ctx.holidays.has(d.date)) warnings.push("This date is a holiday on the Calendar of Activities.");
  if (p.ctx.unavailable.some((u) => u.facultyId === d.proctorId && d.date >= u.start && d.date <= u.end)) conflicts.push("The proctor reported being unavailable on this date.");
  return { conflicts, warnings };
}

export async function checkExamAction(input: ExamInput, excludeId?: string): Promise<Result<{ conflicts: string[]; warnings: string[] }>> {
  await requireScope(...STAFF_ROLES);
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Incomplete examination details." };
  return { ok: true, data: await examProblems(parsed.data, excludeId) };
}

async function sectionDepartment(sectionId: string) {
  const s = await prisma.section.findUnique({ where: { id: sectionId }, select: { program: { select: { departmentId: true } } } });
  return s?.program?.departmentId ?? null;
}

export async function saveExamAction(input: ExamInput, id?: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid examination details." };
  const d = parsed.data;
  if (!canManageDepartment(scope, await sectionDepartment(d.sectionId))) return { ok: false, error: "You can only schedule examinations for sections in your department." };

  const { conflicts } = await examProblems(d, id);
  if (conflicts.length) return { ok: false, error: conflicts.join(" ") };

  const data = { ...d, date: new Date(`${d.date}T00:00:00Z`), notes: d.notes || null };
  const previous = id ? await prisma.examination.findUnique({ where: { id }, select: { proctorId: true } }) : null;
  const exam = id ? await prisma.examination.update({ where: { id }, data }) : await prisma.examination.create({ data });
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: id ? "Edited examination" : "Scheduled examination", entity: "Examination", entityId: exam.id, newValue: d },
  });
  // Everyone with this examination on their schedule hears about it: proctor, instructors, Head of Department.
  await notifyExamParticipants(d, id ? "UPDATED" : "SCHEDULED", { actorUserId: scope.userId, previousProctorId: previous?.proctorId });
  revalidatePath("/examinations");
  revalidatePath("/calendar");
  return { ok: true, data: undefined };
}

export async function deleteExamAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const exam = await prisma.examination.findUnique({ where: { id } });
  if (!exam) return { ok: true, data: undefined };
  if (!canManageDepartment(scope, await sectionDepartment(exam.sectionId))) return { ok: false, error: "You can only remove examinations of your department." };
  await prisma.examination.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: scope.userId, action: "Deleted examination", entity: "Examination", entityId: id, oldValue: exam } });
  await notifyExamParticipants({ ...exam, date: exam.date.toISOString().slice(0, 10) }, "CANCELLED", { actorUserId: scope.userId });
  revalidatePath("/examinations");
  revalidatePath("/calendar");
  return { ok: true, data: undefined };
}

/** Sends (or resends) the examination notice to everyone who has it on their schedule. */
export async function notifyExamAction(id: string): Promise<Result<{ notified: number }>> {
  const scope = await requireScope(...STAFF_ROLES);
  const exam = await prisma.examination.findUnique({ where: { id } });
  if (!exam) return { ok: false, error: "This examination no longer exists." };
  if (!canManageDepartment(scope, await sectionDepartment(exam.sectionId))) return { ok: false, error: "You can only send notices for examinations of your department." };
  const notified = await notifyExamParticipants({ ...exam, date: exam.date.toISOString().slice(0, 10) }, "REMINDER", { actorUserId: scope.userId });
  await prisma.auditLog.create({ data: { userId: scope.userId, action: `Sent examination notice to ${notified} people`, entity: "Examination", entityId: id } });
  return { ok: true, data: { notified } };
}

/** Sends notices for several examinations at once (for example every examination currently listed). */
export async function notifyExamsAction(ids: string[]): Promise<Result<{ exams: number; notified: number }>> {
  let exams = 0;
  let notified = 0;
  for (const id of ids.slice(0, 200)) {
    const res = await notifyExamAction(id);
    if (res.ok) {
      exams++;
      notified += res.data.notified;
    }
  }
  return exams ? { ok: true, data: { exams, notified } } : { ok: false, error: "No examination notices could be sent." };
}
