"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { narrate } from "@/lib/ai/narrative";
import { notifyFaculty } from "@/lib/notify";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { SCHEDULING_ROLES } from "@/lib/permissions/roles";
import { canManageDepartment, requireScope } from "@/lib/permissions/scope";
import { departmentWhere, logBlocked } from "@/lib/permissions/department";
import { refuseSection, sectionAccess } from "@/lib/permissions/section-access";
import { resolveStatus, revalidateScheduler } from "@/lib/scheduler/class-save";
import { validatePlacement } from "@/lib/scheduler/validate";
import { applyChanges, introducedHard, revertChanges } from "@/lib/scheduler/resolver/changes";
import { live, worldOf } from "@/lib/scheduler/resolver/issues";
import { serverInput } from "@/lib/scheduler/resolver/server";
import type { Change, ResolverEntry } from "@/lib/scheduler/resolver/types";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string; stale?: boolean };

const DAY = z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
const entrySchema = z.object({
  id: z.string().min(1),
  semesterId: z.string().min(1),
  sectionId: z.string().min(1),
  subjectId: z.string().min(1),
  facultyId: z.string().min(1),
  roomId: z.string().min(1),
  component: z.enum(["LECTURE", "LABORATORY"]),
  dayOfWeek: DAY,
  startMin: z.number().int().min(0).max(24 * 60),
  endMin: z.number().int().min(0).max(24 * 60),
  status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]),
}).refine((e) => e.endMin > e.startMin);
const changeSchema = z.object({
  id: z.string(),
  type: z.enum(["PLACED", "MOVED", "ROOM_CHANGED", "TIME_CHANGED", "HOURS_ADJUSTED", "REMOVED"]),
  issueId: z.string(),
  group: z.string(),
  sectionId: z.string(),
  before: entrySchema.nullable(),
  after: entrySchema.nullable(),
  reason: z.string().max(500),
}).refine((c) => c.before || c.after);
const applySchema = z.object({
  changes: z.array(changeSchema).min(1).max(1000),
  generatedAt: z.string().datetime(),
  options: z.record(z.string(), z.unknown()),
  summary: z.string().max(4000),
  narrative: z.string().max(4000).nullable(),
});

// A large proposal is many writes to a remote database; the default 5 second limit is too short.
const TRANSACTION = { maxWait: 10_000, timeout: 60_000 };

/** Writes the day, time, room, faculty, and status of many classes in one statement instead of one round trip each. */
async function writeSlots(tx: Prisma.TransactionClient, rows: ResolverEntry[]) {
  if (!rows.length) return;
  const values = Prisma.join(
    rows.map((r) => Prisma.sql`(${r.id}, ${r.dayOfWeek}::"DayOfWeek", ${r.startMin}::int, ${r.endMin}::int, ${r.roomId}, ${r.facultyId}, ${r.status}::"ScheduleStatus")`)
  );
  await tx.$executeRaw`
    UPDATE "Schedule" AS s
    SET "dayOfWeek" = v.day, "startMin" = v.start, "endMin" = v.finish, "roomId" = v.room, "facultyId" = v.faculty, "status" = v.status, "updatedAt" = NOW()
    FROM (VALUES ${values}) AS v(id, day, start, finish, room, faculty, status)
    WHERE s."id" = v.id`;
}

const SAME = ["sectionId", "subjectId", "facultyId", "roomId", "component", "dayOfWeek", "startMin", "endMin"] as const;
const sameSlot = (a: Pick<ResolverEntry, (typeof SAME)[number]>, b: Pick<ResolverEntry, (typeof SAME)[number]>) => SAME.every((k) => a[k] === b[k]);

/** Server time the proposal is generated against; applying refuses if its classes changed after it. */
export async function repairStampAction(): Promise<Result<{ generatedAt: string }>> {
  await requireScope(...SCHEDULING_ROLES);
  return { ok: true, data: { generatedAt: new Date().toISOString() } };
}

/** Optional plain-language summary from anonymized counts and reasons; null when no language model is configured. */
export async function narrateRepairAction(facts: unknown): Promise<Result<{ text: string | null }>> {
  await requireScope(...SCHEDULING_ROLES);
  const text = await narrate(
    "Summarize this proposed class timetable repair for the person reviewing it. Say what was fixed, what could not be fixed and why, and suggest one or two concrete actions for the unfixed issues.",
    facts
  );
  return { ok: true, data: { text } };
}

/**
 * Applies the accepted changes in one transaction. Refuses when any affected class, room, or faculty member
 * changed after the proposal was generated, and re-checks every change against the full timetable with the
 * same validator the resolver used, so nothing the browser sends is trusted.
 */
export async function applyRepairAction(input: z.infer<typeof applySchema>): Promise<Result<{ proposalId: string; changes: Change[] }>> {
  const scope = await requireScope(...SCHEDULING_ROLES);
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The proposal is not valid. Run Resolve issues again." };
  const { changes, generatedAt, options, summary, narrative } = parsed.data as typeof parsed.data & { changes: Change[] };
  const since = new Date(generatedAt);

  // Every touched section must be the caller's to change, and every subject theirs or shared.
  const sectionIds = [...new Set(changes.flatMap((c) => [c.before?.sectionId, c.after?.sectionId]).filter((id): id is string => !!id))];
  const access = await Promise.all(sectionIds.map((id) => sectionAccess(scope, id)));
  const denied = access.find((a): a is Exclude<typeof a, "ok"> => a !== "ok");
  if (denied) return { ok: false, error: await refuseSection(scope, denied, "Schedule") };
  const subjectIds = [...new Set(changes.map((c) => c.after?.subjectId).filter((id): id is string => !!id))];
  if (!scope.isAdmin && (await prisma.subject.count({ where: { id: { in: subjectIds }, ...departmentWhere.subject(scope) } })) !== subjectIds.length) {
    await logBlocked(scope, "apply a schedule repair with another department's subject", "Schedule");
    return { ok: false, error: "The proposal uses a subject outside your department." };
  }

  // Stale check: the original rows must be unchanged, and nothing around them may be newer than the proposal.
  const beforeIds = changes.map((c) => c.before?.id).filter((id): id is string => !!id);
  const rows = await prisma.schedule.findMany({ where: { id: { in: beforeIds } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const roomIds = [...new Set(changes.flatMap((c) => [c.before?.roomId, c.after?.roomId]).filter((id): id is string => !!id))];
  const facultyIds = [...new Set(changes.flatMap((c) => [c.before?.facultyId, c.after?.facultyId]).filter((id): id is string => !!id))];
  const newer = await prisma.schedule.count({ where: { updatedAt: { gt: since }, OR: [{ sectionId: { in: sectionIds } }, { roomId: { in: roomIds } }, { facultyId: { in: facultyIds } }] } });
  const moved = changes.some((c) => c.before && (!byId.get(c.before.id) || byId.get(c.before.id)!.status === "ARCHIVED" || !sameSlot(byId.get(c.before.id)!, c.before)));
  if (newer || moved) return { ok: false, stale: true, error: "The timetable changed after this proposal was generated. Run Resolve issues again." };

  // Full re-check on the server's own data: no change may add a hard problem, and only usable rooms and faculty.
  const termIds = [...new Set(changes.map((c) => (c.after ?? c.before)!.semesterId))];
  const world = await serverInput(scope, termIds);
  const facultyOk = new Set(world.faculty.filter((f) => f.assignable).map((f) => f.id));
  const roomOk = new Set(world.rooms.filter((r) => r.assignable).map((r) => r.id));
  const unusable = changes.find((c) => c.after && ((c.after.facultyId !== c.before?.facultyId && !facultyOk.has(c.after.facultyId)) || (c.after.roomId !== c.before?.roomId && !roomOk.has(c.after.roomId))));
  if (unusable) return { ok: false, error: "A proposed room or faculty member is no longer available to you. Run Resolve issues again." };
  const base = world.entries;
  const after = applyChanges(base, changes);
  const validation = worldOf(world);
  const broken = changes.map((c) => introducedHard(c, base, after, validation)).find((f) => f.length);
  if (broken) return { ok: false, stale: true, error: `A change no longer fits: ${broken[0].message} Run Resolve issues again.` };

  const departments = new Map((await prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, departmentId: true } })).map((s) => [s.id, s.departmentId]));
  // New classes get their ids here so they can be written in one statement and recorded for undo.
  const newStatus = resolveStatus(scope.role, undefined, undefined);
  const stored: Change[] = changes.map((c) =>
    c.before && c.after
      ? { ...c, after: { ...c.after, id: c.before.id, status: resolveStatus(scope.role, undefined, c.before.status) } }
      : c.after
        ? { ...c, after: { ...c.after, id: crypto.randomUUID(), status: newStatus } }
        : c
  );
  const saved = await prisma.$transaction(async (tx) => {
    const created = stored.filter((c) => !c.before && c.after).map((c) => c.after!);
    if (created.length) {
      await tx.schedule.createMany({
        data: created.map((a) => ({
          id: a.id, semesterId: a.semesterId, sectionId: a.sectionId, subjectId: a.subjectId, facultyId: a.facultyId, roomId: a.roomId, component: a.component,
          dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin, status: a.status, departmentId: departments.get(a.sectionId) ?? null,
          notes: "Added by Resolve issues; review before submitting.", generatedBy: scope.userId,
        })),
      });
    }
    const removed = stored.filter((c) => c.before && !c.after).map((c) => c.before!.id);
    if (removed.length) await tx.schedule.updateMany({ where: { id: { in: removed } }, data: { status: "ARCHIVED" } });
    await writeSlots(tx, stored.filter((c) => c.before && c.after).map((c) => c.after!));
    const proposal = await tx.workloadProposal.create({
      data: {
        kind: "SCHEDULE_REPAIR", semesterId: termIds[0], departmentId: scope.isAdmin ? null : scope.departmentId, status: "APPLIED",
        items: stored as unknown as Prisma.InputJsonValue, explanation: summary, narrative, createdById: scope.userId,
        reviewedById: scope.userId, reviewedAt: new Date(), generatedAt: since, options: options as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: { userId: scope.userId, role: scope.role, departmentId: scope.departmentId, action: `Applied Resolve issues proposal: ${stored.length} change(s)`, entity: "WorkloadProposal", entityId: proposal.id, newValue: { options, changes: stored.length } as Prisma.InputJsonValue },
    });
    return { proposalId: proposal.id, stored };
  }, TRANSACTION);

  await notifyFaculty(
    facultyIds,
    { title: "Your teaching schedule changed", message: "Resolve issues on the Scheduler placed or moved one or more of your classes. Check your timetable.", link: "/scheduler", type: "INFO" }
  );
  queueWorkloadCheck("Scheduler issues resolved", scope.userId);
  revalidateScheduler();
  return { ok: true, data: { proposalId: saved.proposalId, changes: saved.stored } };
}

/** Undoes an applied repair when its classes are untouched since and their original slots are still free. */
export async function undoRepairAction(id: string): Promise<Result<{ entries: ResolverEntry[]; removedIds: string[] }>> {
  const scope = await requireScope(...SCHEDULING_ROLES);
  const proposal = await prisma.workloadProposal.findUnique({ where: { id } });
  if (!proposal || proposal.kind !== "SCHEDULE_REPAIR" || proposal.status !== "APPLIED") return { ok: false, error: "This change no longer exists." };
  if (proposal.undoneAt) return { ok: false, error: "This change was already undone." };
  if (!scope.isAdmin && proposal.createdById !== scope.userId && !canManageDepartment(scope, proposal.departmentId)) return { ok: false, error: "Only the person who applied it or the Registrar can undo this." };

  const changes = proposal.items as unknown as Change[];
  const ids = changes.map((c) => (c.after ?? c.before)!.id);
  const rows = new Map((await prisma.schedule.findMany({ where: { id: { in: ids } } })).map((r) => [r.id, r]));
  const touched = changes.some((c) => {
    const row = rows.get((c.after ?? c.before)!.id);
    if (!row) return true;
    return c.after ? row.status === "ARCHIVED" || !sameSlot(row, c.after) : row.status !== "ARCHIVED";
  });
  if (touched) return { ok: false, error: "Some of these classes were edited after the change was applied. Undo them by hand." };

  // Restoring must not double-book with a class placed after the change was applied.
  const termIds = [...new Set(changes.map((c) => (c.after ?? c.before)!.semesterId))];
  const world = await serverInput(scope, termIds);
  const restored = live(revertChanges(world.entries, changes));
  const validation = worldOf(world);
  const batch = new Set(ids);
  const clashIds = changes
    .filter((c) => c.before)
    .flatMap((c) => validatePlacement(c.before!, restored, validation).filter((f) => f.overlap).flatMap((f) => f.entryIds))
    .filter((x) => !batch.has(x));
  if (clashIds.length && (await prisma.schedule.count({ where: { id: { in: clashIds }, updatedAt: { gt: proposal.reviewedAt ?? proposal.createdAt } } }))) {
    return { ok: false, error: "A class was placed in one of the original slots since. Move it first, then undo." };
  }

  await prisma.$transaction(async (tx) => {
    // Classes the change created are archived; every other class goes back to its original slot and status.
    const created = changes.filter((c) => !c.before && c.after).map((c) => c.after!.id);
    if (created.length) await tx.schedule.updateMany({ where: { id: { in: created } }, data: { status: "ARCHIVED" } });
    await writeSlots(tx, changes.filter((c) => c.before).map((c) => c.before!));
    await tx.workloadProposal.update({ where: { id }, data: { undoneAt: new Date(), undoneById: scope.userId } });
    await tx.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: scope.departmentId, action: `Undid Resolve issues proposal: ${changes.length} change(s)`, entity: "WorkloadProposal", entityId: id } });
  }, TRANSACTION);
  await notifyFaculty(
    changes.flatMap((c) => [c.before?.facultyId, c.after?.facultyId]).filter((f): f is string => !!f),
    { title: "A schedule change was undone", message: "Classes moved by Resolve issues on the Scheduler are back where they were. Check your timetable.", link: "/scheduler", type: "INFO" }
  );
  queueWorkloadCheck("Scheduler repair undone", scope.userId);
  revalidateScheduler();
  return {
    ok: true,
    data: { entries: changes.filter((c) => c.before).map((c) => c.before!), removedIds: changes.filter((c) => !c.before && c.after).map((c) => c.after!.id) },
  };
}
