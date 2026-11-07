"use server";

import { z } from "zod";
import { loadWorkload } from "@/lib/workload/load";
import { loadReport } from "@/lib/workload/optimizer";
import { activeTermIds } from "@/lib/workload/auto";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { PUBLISH_ROLES, STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope, type Scope } from "@/lib/permissions/scope";
import { refuseSection, sectionAccess } from "@/lib/permissions/section-access";
import { departmentWhere, logBlocked } from "@/lib/permissions/department";
import { termConstraintReport } from "@/lib/scheduler/constraints-server";
import { checkClass, revalidateScheduler as revalidate, writeClass, type ClassData, type SaveResult } from "@/lib/scheduler/class-save";
import { foreignDepartments, requestCrossDepartment } from "@/lib/requests/cross-department";
import type { Violation } from "@/lib/scheduler/constraints";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const DAY = z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
const STATUS = z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);

const classSchema = z
  .object({
    id: z.string().optional(),
    semesterId: z.string().min(1, "Choose a term"),
    sectionId: z.string().min(1, "Choose a section"),
    subjectId: z.string().min(1, "Choose a subject"),
    facultyId: z.string().min(1, "Choose a faculty member"),
    roomId: z.string().min(1, "Choose a room"),
    component: z.enum(["LECTURE", "LABORATORY"]),
    dayOfWeek: DAY,
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    status: STATUS.optional(),
    notes: z.string().max(500).optional(),
    doNotMove: z.boolean().optional(),
    source: z.enum(["CURRICULUM_QUEUE"]).optional(),
  })
  .refine((d) => d.endMin > d.startMin, { message: "End time must be after start time", path: ["endMin"] });

export type ClassInput = z.infer<typeof classSchema>;

/**
 * Shared path for saving and moving: the section (new and current) must be the department's own and the
 * subject its own or shared. A free faculty member or room of another department turns the change into a
 * request for that department's approval; a busy one is reported without naming the class that holds it.
 */
async function saveScoped(scope: Scope, d: ClassData, overrideSoft: boolean, action: string): Promise<SaveResult> {
  const current = d.id ? await prisma.schedule.findUnique({ where: { id: d.id }, select: { sectionId: true } }) : null;
  for (const id of [d.sectionId, current?.sectionId]) {
    const access = id ? await sectionAccess(scope, id) : "ok";
    if (access !== "ok") return { ok: false, error: await refuseSection(scope, access, "Schedule", d.id) };
  }
  if (!scope.isAdmin && !(await prisma.subject.count({ where: { id: d.subjectId, ...departmentWhere.subject(scope) } }))) {
    return { ok: false, error: "Choose a subject of your department or a shared General Education subject." };
  }
  const problem = await checkClass(d, { userId: scope.userId }, { overrideSoft, viewerDepartmentId: scope.isAdmin ? undefined : scope.departmentId });
  if (problem) return problem;
  const foreign = await foreignDepartments(scope, d.facultyId, d.roomId);
  if (foreign.length) return requestCrossDepartment(scope, d, foreign);
  return writeClass(d, { userId: scope.userId, role: scope.role }, action);
}

async function validateCurriculumQueue(scope: Scope, d: ClassData & { source?: "CURRICULUM_QUEUE" }) {
  if (scope.role !== "HEAD_OF_DEPARTMENT" || d.id) return null;
  if (d.source !== "CURRICULUM_QUEUE") return "New classes must be added from the approved Unscheduled curriculum queue.";
  const placeholder = await prisma.sectionClassPlaceholder.findFirst({
    where: { sectionId: d.sectionId, subjectId: d.subjectId, component: d.component, section: { ...departmentWhere.section(scope), semesterId: d.semesterId } },
    select: { subject: { select: { lectureHours: true, labHours: true } } },
  });
  if (!placeholder) return "That subject component is not in this section's approved curriculum for the selected term.";
  const requiredMin = Math.round((d.component === "LECTURE" ? placeholder.subject.lectureHours : placeholder.subject.labHours) * 60);
  const existing = await prisma.schedule.findMany({
    where: { sectionId: d.sectionId, subjectId: d.subjectId, component: d.component, semesterId: d.semesterId, status: { not: "ARCHIVED" } },
    select: { startMin: true, endMin: true },
  });
  const plotted = existing.reduce((sum, entry) => sum + entry.endMin - entry.startMin, 0) + d.endMin - d.startMin;
  return plotted > requiredMin ? `This placement would exceed the required ${requiredMin / 60} hours for this subject component.` : null;
}

export async function saveClassAction(input: ClassInput, overrideSoft = false): Promise<SaveResult> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = classSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid class details." };
  const queueProblem = await validateCurriculumQueue(scope, parsed.data);
  if (queueProblem) { await logBlocked(scope, "create an ad-hoc class outside the approved curriculum queue", "Schedule"); return { ok: false, error: queueProblem }; }
  if (scope.isAdmin && !parsed.data.notes?.trim()) return { ok: false, error: "Explain the reason for this Registrar correction in Notes." };
  const { source: _source, ...classData } = parsed.data;
  return saveScoped(scope, classData, overrideSoft, parsed.data.id ? "Edited class schedule" : "Created class schedule");
}

const moveSchema = z
  .object({
    id: z.string().min(1),
    dayOfWeek: DAY,
    startMin: z.number().int().min(0),
    endMin: z.number().int().max(24 * 60),
  })
  .refine((d) => d.endMin > d.startMin);

/** Drag-and-drop move: changes only the day and time, with the same checks as a save. */
export async function moveClassAction(input: z.infer<typeof moveSchema>, overrideSoft = false): Promise<SaveResult> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid move." };
  const { id, ...slot } = parsed.data;
  const existing = await prisma.schedule.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "This class was deleted by someone else." };
  const e = existing;
  const moved: ClassData = {
    id, semesterId: e.semesterId, sectionId: e.sectionId, subjectId: e.subjectId, facultyId: e.facultyId, roomId: e.roomId,
    component: e.component, notes: e.notes ?? undefined, ...slot,
  };
  return saveScoped(scope, moved, overrideSoft, "Moved class (drag and drop)");
}

export async function deleteClassAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const existing = await prisma.schedule.findUnique({ where: { id } });
  if (!existing) return { ok: true, data: undefined };
  const access = await sectionAccess(scope, existing.sectionId);
  if (access !== "ok") return { ok: false, error: await refuseSection(scope, access, "Schedule", id) };
  await prisma.schedule.update({ where: { id }, data: { status: "ARCHIVED" } });
  await prisma.auditLog.create({
    data: { userId: scope.userId, role: scope.role, departmentId: existing.departmentId, action: "Archived class schedule", entity: "Schedule", entityId: id, oldValue: existing },
  });
  revalidate();
  queueWorkloadCheck("A class was archived");
  return { ok: true, data: undefined };
}

/** Bulk publish (e.g. everything visible in the current filter). */
export async function publishClassesAction(ids: string[]): Promise<Result<{ count: number }>> {
  const scope = await requireScope(...PUBLISH_ROLES);

  const parsed = z.array(z.string().min(1)).max(2000).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };
  const { count } = await prisma.schedule.updateMany({
    where: { id: { in: parsed.data }, status: "REVIEW" },
    data: { status: "PUBLISHED" },
  });
  await prisma.auditLog.create({
    data: { userId: scope.userId, action: `Published ${count} class schedule(s)`, entity: "Schedule" },
  });
  revalidate();
  return { ok: true, data: { count } };
}

/** Sends a department's draft timetable to the Registrar as one review batch; unbalanced loads need an override reason. */
export async function submitClassesAction(ids: string[], overrideReason?: string): Promise<Result<{ count: number }> | { ok: false; error: string; imbalance: string[] }> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const parsed = z.array(z.string().min(1)).min(1).max(2000).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select at least one class schedule." };
  const selected = await prisma.schedule.findMany({
    where: { id: { in: parsed.data }, ...departmentWhere.schedule(scope), status: "DRAFT" },
    select: { id: true, sectionId: true, semesterId: true },
  });
  if (selected.length !== new Set(parsed.data).size) return { ok: false, error: "One or more class schedules were not found." };
  const unassigned = await prisma.schedule.findMany({
    where: { id: { in: parsed.data }, faculty: { archivedAt: { not: null } } },
    select: { subject: { select: { code: true } }, section: { select: { name: true } } },
  });
  if (unassigned.length) return { ok: false, error: `Assign faculty before submitting: ${unassigned.map((u) => `${u.subject.code} ${u.section.name}`).join(", ")}.` };
  const sectionIds = [...new Set(selected.map((entry) => entry.sectionId))];
  const [placeholders, plotted] = await Promise.all([
    prisma.sectionClassPlaceholder.findMany({ where: { sectionId: { in: sectionIds } }, include: { subject: { select: { code: true, lectureHours: true, labHours: true } } } }),
    prisma.schedule.findMany({ where: { sectionId: { in: sectionIds }, status: { not: "ARCHIVED" } }, select: { sectionId: true, subjectId: true, component: true, startMin: true, endMin: true } }),
  ]);
  const incomplete = placeholders.filter((placeholder) => {
    const required = (placeholder.component === "LECTURE" ? placeholder.subject.lectureHours : placeholder.subject.labHours) * 60;
    const actual = plotted.filter((entry) => entry.sectionId === placeholder.sectionId && entry.subjectId === placeholder.subjectId && entry.component === placeholder.component).reduce((sum, entry) => sum + entry.endMin - entry.startMin, 0);
    return actual !== required;
  });
  if (incomplete.length) return { ok: false, error: `Complete the required hours before submitting: ${[...new Set(incomplete.map((item) => item.subject.code))].join(", ")}.` };
  const workload = await loadWorkload(await activeTermIds(), null);
  const unit = workload.limits.measure === "HOURS" ? "hours" : "units";
  const off = loadReport(workload.faculty.filter((f) => scope.departmentIds.includes(f.departmentId ?? "")), workload.assignments, workload.limits).filter((r) => r.status !== "BALANCED");
  const reason = overrideReason?.trim().slice(0, 500);
  if (off.length && !reason) {
    return { ok: false, error: `${off.length} faculty member(s) are outside the allowed load.`, imbalance: off.map((r) => `${r.name}: ${r.load} ${unit}, ${r.status === "OVERLOADED" ? `above the maximum of ${r.maximum}` : `below the minimum of ${r.minimum}`}`) };
  }
  const { count } = await prisma.schedule.updateMany({
    where: { id: { in: parsed.data }, status: "DRAFT", ...departmentWhere.schedule(scope) },
    data: { status: "REVIEW" },
  });
  await prisma.auditLog.create({
    data: {
      userId: scope.userId, role: scope.role, departmentId: scope.departmentId, entity: "Schedule",
      action: `Submitted ${count} class schedule(s) for Registrar review${off.length ? ` with a workload override (${off.length} faculty out of range)` : ""}`,
      ...(off.length ? { reason, oldValue: { outOfRange: off.map((r) => ({ name: r.name, load: r.load, minimum: r.minimum, maximum: r.maximum, status: r.status })) } } : {}),
    },
  });
  revalidate();
  return { ok: true, data: { count } };
}
/** Constraint report for a term; a Head of Department only sees findings involving their department. */
export async function constraintReportAction(termId: string): Promise<Result<Violation[]>> {
  const scope = await requireScope(...STAFF_ROLES);
  if (!termId) return { ok: false, error: "Choose a term first." };
  return { ok: true, data: await termConstraintReport(termId, scope.manageDepartmentId) };
}
