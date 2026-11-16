"use server";

import { z } from "zod";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AcademicLevel } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { can, isActivePolicyUser, scopeQuery } from "@/lib/permissions/policy";
import { SCHEDULING_ROLES } from "@/lib/permissions/roles";
import { policyUserFromScope, requireScope, type Scope } from "@/lib/permissions/scope";
import { notifyPlan, planSuspension, undoBatch, writePlan, type AdjustmentPlan } from "@/lib/occupancy/adjust";
import { notifyUsers } from "@/lib/notify";
import { deliveryMode, virtualClassPlan } from "@/lib/suspensions/continuity";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

class ContinuityError extends Error {}
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose valid dates").refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose valid dates");

const requestSchema = z
  .object({
    title: z.string().trim().min(3, "Give the suspension a title").max(120),
    reason: z.string().trim().min(3, "Give a reason").max(300),
    start: DATE,
    end: DATE,
    startMin: z.number().int().min(0).max(24 * 60).nullable(),
    endMin: z.number().int().min(0).max(24 * 60).nullable(),
    /** Programs (courses or strands) whose sections are suspended; empty means every section of the chosen level (or of every level for an all-levels Registrar order). */
    programIds: z.array(z.string().min(1)).max(200).default([]).transform((ids) => [...new Set(ids)]),
    sectionIds: z.array(z.string().min(1)).max(500).default([]).transform((ids) => [...new Set(ids)]),
    scheduleIds: z.array(z.string().min(1)).max(500).default([]).transform((ids) => [...new Set(ids)]),
    mode: z.enum(["SUSPEND", "VIRTUAL"]).default("SUSPEND"),
    meetingLink: z.string().trim().max(1000).default("").refine((value) => {
      if (!value) return true;
      try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
    }, "Use a valid HTTPS meeting link."),
    instructions: z.string().trim().max(500).default(""),
    /** One academic level per order; null is an explicit all-levels order, Registrar only. */
    level: z.nativeEnum(AcademicLevel).nullable(),
  })
  .refine((d) => [d.programIds, d.sectionIds, d.scheduleIds].filter((list) => list.length).length <= 1, "Select programs, sections, or individual classes; use one target type at a time.")
  .refine((d) => d.end >= d.start, { message: "The end date cannot be before the start date." })
  .refine((d) => (d.startMin === null) === (d.endMin === null) && (d.startMin === null || d.endMin! > d.startMin), { message: "Give both a start and an end time, or neither for whole days." })
  .refine((d) => (new Date(`${d.end}T00:00:00Z`).getTime() - new Date(`${d.start}T00:00:00Z`).getTime()) / 86400000 < 31, { message: "Change at most 31 days at a time." });

export type SuspensionRequest = z.input<typeof requestSchema>;
type Request = z.output<typeof requestSchema>;
export type SuspensionPreview = AdjustmentPlan & { fingerprint: string };

interface Resolved { sectionIds: string[]; scheduleIds?: string[]; level: SuspensionRequest["level"]; departmentId: string | null }

/** Checks the caller's authority over every section and resolves the final section list, level, and owning department. */
async function resolve(scope: Scope, req: Request): Promise<Resolved | { error: string }> {
  const user = policyUserFromScope(scope);
  if (!isActivePolicyUser(user) || !SCHEDULING_ROLES.includes(scope.role)) return { error: "Your account cannot issue class changes." };
  const named = req.programIds.length > 0 || req.sectionIds.length > 0 || req.scheduleIds.length > 0;
  if (!named && scope.role !== "REGISTRAR") return { error: "Choose the programs, sections, or classes you handle." };
  const sections = req.scheduleIds.length ? (await prisma.schedule.findMany({
    where: { AND: [scopeQuery(user, "schedule"), { id: { in: req.scheduleIds }, status: "PUBLISHED", section: { archivedAt: null, ...(req.level ? { level: req.level } : {}) } }] },
    select: { id: true, section: { select: { id: true, level: true, departmentId: true, programId: true } } },
  })).map((row) => ({ ...row.section, scheduleId: row.id })) : await prisma.section.findMany({
    where: { AND: [scopeQuery(user, "section"), { archivedAt: null, ...(req.programIds.length ? { programId: { in: req.programIds } } : req.sectionIds.length ? { id: { in: req.sectionIds } } : {}), ...(req.level ? { level: req.level } : {}) }] },
    select: { id: true, level: true, departmentId: true, programId: true },
  });
  if (!sections.length) return { error: "No available sections or published classes match this selection." };
  const found = new Set(req.scheduleIds.length ? sections.map((s) => "scheduleId" in s ? s.scheduleId : "") : req.sectionIds.length ? sections.map((s) => s.id) : sections.map((s) => s.programId));
  const requested = req.scheduleIds.length ? req.scheduleIds : req.sectionIds.length ? req.sectionIds : req.programIds;
  if (requested.some((id) => !found.has(id))) return { error: "Some selected records are unavailable or outside the department and programs you handle." };

  const levels = new Set(sections.map((s) => s.level));
  if (named && levels.size > 1) return { error: "Suspend one academic level at a time." };
  const level = !named && !req.level ? null : req.level ?? sections[0]?.level ?? null;
  if (req.level && levels.size && !levels.has(req.level)) return { error: "The chosen programs are not in that academic level." };
  if (!level && scope.role !== "REGISTRAR") return { error: "Only the Registrar can suspend classes in every level." };

  const denied = sections.some((s) => !can(user, "create", { type: "classSuspension", departmentId: s.departmentId, programId: s.programId }));
  if (denied || (!sections.length && scope.role !== "REGISTRAR")) return { error: "You can only suspend classes of sections in your department." };
  const departments = new Set(sections.map((s) => s.departmentId));
  return { sectionIds: [...new Set(sections.map((s) => s.id))], scheduleIds: req.scheduleIds.length ? [...new Set(req.scheduleIds)] : undefined, level, departmentId: departments.size === 1 ? [...departments][0] : null };
}

async function checked(input: SuspensionRequest) {
  const scope = await requireScope(...SCHEDULING_ROLES);
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." } as const;
  const resolved = await resolve(scope, parsed.data);
  return "error" in resolved ? ({ error: resolved.error } as const) : ({ scope, req: parsed.data, resolved } as const);
}

const range = (r: SuspensionRequest) => ({ start: r.start, end: r.end, startMin: r.startMin, endMin: r.endMin });
async function plan(req: Request, resolved: Resolved) {
  const result = await planSuspension(resolved.sectionIds, range(req), resolved.scheduleIds);
  return req.mode === "VIRTUAL" ? virtualClassPlan(result, req.reason, req.meetingLink, req.instructions) : { ...result, items: result.items.map((item) => ({ ...item, reason: `${req.reason}. Classes are suspended; arrange a make-up if needed.` })) };
}
const fingerprint = (result: AdjustmentPlan) => createHash("sha256").update(JSON.stringify([...result.items].sort((a, b) => `${a.scheduleId}:${a.before.date}`.localeCompare(`${b.scheduleId}:${b.before.date}`)))).digest("hex");

/** Before-and-after preview for cancelled or virtual meetings; nothing is saved. */
export async function previewSuspensionAction(input: SuspensionRequest): Promise<Result<SuspensionPreview>> {
  const c = await checked(input);
  if ("error" in c) return { ok: false, error: c.error! };
  const result = await plan(c.req, c.resolved);
  return { ok: true, data: { ...result, fingerprint: fingerprint(result) } };
}

/** Takes effect immediately for the issuer's own scope; the order, its issuer, and its role are kept and audited. */
export async function applySuspensionAction(input: SuspensionRequest, previewFingerprint?: string): Promise<Result<{ id: string; batchId: string; plan: AdjustmentPlan }>> {
  const c = await checked(input);
  if ("error" in c) return { ok: false, error: c.error! };
  const { scope, req, resolved } = c;
  if (!previewFingerprint) return { ok: false, error: "Preview the affected classes before confirming." };
  const virtual = req.mode === "VIRTUAL";
  const dates = req.start === req.end ? req.start : `${req.start} to ${req.end}`;
  const issuer = scope.role === "REGISTRAR" ? "Registrar" : "Head of Department";
  const when = { startDate: new Date(`${req.start}T00:00:00Z`), endDate: new Date(`${req.end}T00:00:00Z`), startMin: req.startMin, endMin: req.endMin };
  let saved;
  try {
    saved = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('class-continuity'))`;
      const result = await plan(req, resolved);
      if (result.blockers.length) throw new ContinuityError(result.blockers.join(" "));
      if (!result.items.length) throw new ContinuityError("No published classes meet during this period. Choose another date or selection.");
      if (fingerprint(result) !== previewFingerprint) throw new ContinuityError("The affected classes changed since your preview. Preview the impact again before confirming.");
      const scheduleIds = [...new Set(result.items.map((item) => item.scheduleId))];
      const authorized = await tx.schedule.count({ where: { AND: [scopeQuery(policyUserFromScope(scope), "schedule"), { id: { in: scheduleIds }, status: "PUBLISHED" }] } });
      if (authorized !== scheduleIds.length) throw new ContinuityError("A selected class is no longer published or within your scope. Preview again.");
      const batchId = await writePlan(tx, result, "CLASS_SUSPENSION", `${virtual ? "Virtual classes" : "Class suspension"} (${dates}): ${req.reason}`, scope.userId, resolved.departmentId);
      const suspension = await tx.classSuspension.create({ data: { title: req.title, reason: req.reason, sectionIds: resolved.sectionIds, level: resolved.level, departmentId: resolved.departmentId, issuedById: scope.userId, issuedRole: scope.role, batchId, ...when } });
      await tx.activity.create({ data: {
        type: virtual ? "SCHOOL_EVENT" : "CLASS_SUSPENSION", title: virtual ? `Virtual class: ${req.title}` : req.title,
        description: [req.reason, req.instructions, `Ordered by the ${issuer}.`, virtual ? "Classes continue virtually at their original times." : "Only selected class meetings are suspended."].filter(Boolean).join(" "),
        location: virtual && req.meetingLink ? req.meetingLink : null, status: "APPROVED", sectionIds: resolved.sectionIds, level: resolved.level,
        departmentId: resolved.departmentId, batchId, createdById: scope.userId, ...when,
      } });
      await tx.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: resolved.departmentId,
        action: `${virtual ? "Virtual classes" : "Class suspension"} ordered by ${issuer}, effective immediately: ${req.title} (${dates})`, entity: "ClassSuspension", entityId: suspension.id,
        newValue: { mode: req.mode, reason: req.reason, level: resolved.level, sections: resolved.sectionIds, scheduleIds, affected: result.items.length } } });
      return { id: suspension.id, batchId, plan: result };
    }, { timeout: 30000 });
  } catch (error) {
    if (error instanceof ContinuityError) return { ok: false, error: error.message };
    throw error;
  }
  await notifyPlan(saved.plan);
  await notifyStudents(saved.plan.items.map((item) => item.scheduleId), virtual ? "Your class will meet virtually" : "Class suspension", `${req.title}: ${dates}. ${virtual ? "Affected classes continue virtually at their original times. Check your class changes for joining details." : "Check your timetable for the affected class meetings."}`);
  revalidate();
  queueWorkloadCheck(virtual ? "Classes moved to virtual delivery" : "A class suspension was ordered");
  return { ok: true, data: saved };
}

async function notifyStudents(scheduleIds: string[], title: string, message: string) {
  const published = await prisma.schedule.findMany({ where: { id: { in: scheduleIds }, status: "PUBLISHED" }, select: { sectionId: true } });
  const students = await prisma.student.findMany({ where: { sectionId: { in: [...new Set(published.map((row) => row.sectionId))] }, user: { status: "ACTIVE", archivedAt: null } }, select: { userId: true } });
  await notifyUsers(students.map((student) => student.userId), { title, message, link: "/student/schedule", type: "WARNING" });
}

/** Lifts an order: cancelled classes return to their slots. A department order can be lifted by its Head of Department or the Registrar. */
export async function liftSuspensionAction(id: string): Promise<Result> {
  const scope = await requireScope(...SCHEDULING_ROLES);
  const s = await prisma.classSuspension.findUnique({ where: { id }, include: { batch: { select: { adjustments: { select: { kind: true, scheduleId: true } } } } } });
  if (!s || s.status !== "ACTIVE") return { ok: false, error: "This suspension was already lifted." };
  const user = policyUserFromScope(scope);
  if (!isActivePolicyUser(user) || !SCHEDULING_ROLES.includes(scope.role)) return { ok: false, error: "Your account cannot lift class changes." };
  if (scope.role !== "REGISTRAR") {
    const sections = await prisma.section.findMany({ where: { id: { in: s.sectionIds } }, select: { id: true, departmentId: true, programId: true } });
    if (!s.sectionIds.length || sections.length !== s.sectionIds.length || sections.some((section) => !can(user, "edit", { type: "classSuspension", departmentId: section.departmentId, programId: section.programId }))) return { ok: false, error: "You can only lift changes for classes in the department and programs you handle." };
    const scheduleIds = [...new Set(s.batch?.adjustments.map((item) => item.scheduleId) ?? [])];
    if (scheduleIds.length && await prisma.schedule.count({ where: { AND: [scopeQuery(user, "schedule"), { id: { in: scheduleIds } }] } }) !== scheduleIds.length) return { ok: false, error: "Some affected classes are no longer in the scope you handle. Ask the Registrar to restore this arrangement." };
  }

  if (s.batchId) {
    const problem = await undoBatch(s.batchId);
    if (problem) return { ok: false, error: problem };
    await prisma.activity.deleteMany({ where: { batchId: s.batchId } });
  }
  await prisma.classSuspension.update({ where: { id }, data: { status: "LIFTED", liftedById: scope.userId, liftedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: scope.userId, role: scope.role, action: `${deliveryMode(s.batch?.adjustments ?? []) === "VIRTUAL" ? "Virtual class arrangement" : "Class suspension"} lifted: ${s.title}`, entity: "ClassSuspension", entityId: id } });
  await notifyStudents(s.batch?.adjustments.map((item) => item.scheduleId) ?? [], "Class arrangements restored", `${s.title} was lifted. Check your timetable for the original class arrangements.`);
  revalidate();
  queueWorkloadCheck("A class suspension was lifted");
  return { ok: true, data: undefined };
}

function revalidate() {
  for (const path of ["/suspensions", "/adjustments", "/calendar", "/scheduler", "/analytics", "/reports", "/dashboard", "/student", "/student/schedule"]) revalidatePath(path);
}
