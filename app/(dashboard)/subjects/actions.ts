"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { OUTSIDE_DEPARTMENT, requireScope } from "@/lib/permissions/scope";
import { canManageSubject } from "@/lib/subjects/permissions";
import { logBlocked, recordDepartment } from "@/lib/permissions/department";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { kindLabel, subjectRequestSchema, type SubjectRequestDetails, type SubjectRequestInput } from "@/lib/subjects/request-rules";
import { ACADEMIC_LEVELS, GRADE_LEVELS, LEVELS, YEAR_LEVELS } from "@/lib/academics/levels";

type Result = { ok: boolean; error?: string };

const schema = z
  .object({
    code: z.string().trim().min(1, "Code is required").max(30),
    name: z.string().trim().min(1, "Name is required").max(150),
    description: z.string().max(500).optional(),
    units: z.coerce.number().min(0, "Units can't be negative").max(30),
    lectureHours: z.coerce.number().min(0).max(40),
    labHours: z.coerce.number().min(0).max(40),
    requiredRoomType: z.enum(["LECTURE_ROOM", "COMPUTER_LABORATORY", "SCIENCE_LABORATORY", "CONFERENCE_ROOM", "OTHER"]),
    level: z.enum(ACADEMIC_LEVELS),
    programId: z.string().optional(),
    yearLevel: z.enum(YEAR_LEVELS).optional().or(z.literal("")),
    gradeLevel: z.enum(GRADE_LEVELS).optional().or(z.literal("")),
    category: z.enum(["MAJOR", "MINOR"]).default("MAJOR"),
    semester: z.enum(["FIRST", "SECOND", "SUMMER"]).optional().or(z.literal("")),
  })
  .refine((d) => d.lectureHours + d.labHours > 0, { message: "Add lecture or lab hours per week" })
  .refine((d) => d.level === "COLLEGE" || (!!d.gradeLevel && LEVELS[d.level].grades.includes(d.gradeLevel)), {
    message: "Choose a grade level that belongs to this academic level",
  });

async function clean(d: z.infer<typeof schema>) {
  let programId = d.programId || null;
  if (d.level !== "COLLEGE" && d.level !== "SENIOR_HIGH") programId = null;
  if (programId) {
    const program = await prisma.program.findUnique({ where: { id: programId }, select: { level: true } });
    if (!program || program.level !== d.level) programId = null;
  }
  return {
    code: d.code,
    name: d.name,
    description: d.description || null,
    units: d.units,
    lectureHours: d.lectureHours,
    labHours: d.labHours,
    requiredRoomType: d.requiredRoomType,
    level: d.level,
    programId,
    yearLevel: d.level === "COLLEGE" ? d.yearLevel || null : null,
    gradeLevel: d.level === "COLLEGE" ? null : d.gradeLevel || null,
    category: d.category,
    semester: d.level === "COLLEGE" ? d.semester || null : null,
  };
}

export async function saveSubjectAction(id: string | null, formData: FormData): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const data = await clean(parsed.data);
  // Subjects belong to their course or strand's department; General Education subjects (none) are the Registrar's.
  const existing = id ? await prisma.subject.findUnique({ where: { id }, select: { departmentId: true } }) : null;
  const departmentId = await recordDepartment(scope, data.programId, data.level, existing?.departmentId);
  const actor = scope;
  if (!canManageSubject(actor, { departmentId }) || (existing && !canManageSubject(actor, existing))) {
    await logBlocked(scope, "save a subject outside the department", "Subject", id);
    return { ok: false, error: OUTSIDE_DEPARTMENT };
  }
  try {
    if (id) await prisma.subject.update({ where: { id }, data: { ...data, departmentId } });
    else {
      const last = await prisma.subject.aggregate({ _max: { sortOrder: true } });
      await prisma.subject.create({ data: { ...data, departmentId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }
  } catch {
    return { ok: false, error: `A subject with the code "${data.code}" already exists.` };
  }
  revalidatePath("/subjects");
  revalidatePath("/scheduler");
  queueWorkloadCheck("A subject was changed");
  return { ok: true };
}

/** Files a change request for a subject owned by another department; it is reviewed in Schedule Requests. */
export async function createSubjectRequestAction(input: SubjectRequestInput): Promise<Result & { requestId?: string }> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = subjectRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const { subjectId, kind, reason, preferredFacultyId } = parsed.data;

  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { departmentId: true, code: true, archivedAt: true } });
  if (!subject || subject.archivedAt) return { ok: false, error: "Subject not found." };
  if (canManageSubject(scope, subject)) return { ok: false, error: "You can edit this subject directly." };
  const preferred = preferredFacultyId ? await prisma.faculty.findFirst({ where: { id: preferredFacultyId, status: "ACTIVE", archivedAt: null }, select: { fullName: true } }) : null;
  if (preferredFacultyId && !preferred) return { ok: false, error: "That faculty member is not active." };

  const open = await prisma.scheduleRequest.findMany({ where: { type: "SUBJECT_CHANGE", status: "PENDING", requestedById: scope.userId }, select: { details: true } });
  if (open.some((r) => (r.details as unknown as SubjectRequestDetails).subjectId === subjectId)) return { ok: false, error: `You already have a pending request for ${subject.code}.` };

  const details: SubjectRequestDetails = { kind: "SUBJECT_CHANGE", subjectId, subjectCode: subject.code, changeType: kind, preferredFacultyId, preferredFacultyName: preferred?.fullName ?? null };
  const summary = `${subject.code} · ${kindLabel(kind)}${preferred ? ` (preferred: ${preferred.fullName})` : ""}: ${reason}`;
  const request = await prisma.scheduleRequest.create({
    data: { type: "SUBJECT_CHANGE", requestedById: scope.userId, departmentId: scope.departmentId, targetDepartmentId: subject.departmentId, details: details as never, reason: summary },
  });
  const recipients = await prisma.user.findMany({
    where: { status: "ACTIVE", archivedAt: null, role: "HEAD_OF_DEPARTMENT", faculty: { departmentId: subject.departmentId ?? scope.departmentId ?? "__none__" } },
    select: { id: true },
  });
  if (recipients.length) await prisma.notification.createMany({ data: recipients.map(({ id: userId }) => ({ userId, type: "INFO" as const, title: `Subject change requested for ${subject.code}`, message: summary.slice(0, 240), link: "/requests" })) });
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: scope.departmentId, action: `Requested a change to ${subject.code}`, entity: "ScheduleRequest", entityId: request.id, newValue: { kind, preferredFacultyId } } });
  revalidatePath("/subjects");
  revalidatePath("/requests");
  return { ok: true, requestId: request.id };
}
