import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { serverInput } from "./resolver/server";
import { DEFAULT_OPTIONS, type Change, type ResolverInput } from "./resolver/types";
import { solve } from "./resolver/solver";
import { templateSummary } from "./resolver/explain";
import { validatePlacement } from "./validate";
import { worldOf } from "./resolver/issues";
import { collegeLengthError } from "./timetable";

export class AutoScheduleError extends Error {}

/** A stable snapshot of the queue, assignments, resources, configuration and concurrent timetable. */
export function autoScheduleBasis(input: ResolverInput) {
  const canonical = (value: unknown): unknown => {
    if (value instanceof Map) return canonical([...value]);
    if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
  };
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}

/** Re-check the accepted placements as a batch, against saved meetings and the current explicit teacher. */
export function validateAutoPlacements(input: ResolverInput, changes: Change[]) {
  const entries = [...input.entries];
  const world = worldOf(input);
  for (const c of changes) {
    const e = c.after;
    if (c.before || !e || c.type !== "PLACED" || e.status !== "DRAFT" || c.sectionId !== e.sectionId) throw new AutoScheduleError("Auto-Schedule may only add new draft meetings.");
    const section = input.sections.find((s) => s.id === e.sectionId && s.editable && s.termId === e.semesterId);
    if (!section) throw new AutoScheduleError("This section or timetable is no longer editable.");
    const need = section.curriculum.find((n) => n.subjectId === e.subjectId && n.component === e.component);
    if (!need) throw new AutoScheduleError("A subject component is no longer in this section's approved curriculum.");
    const teacher = input.assignments?.find((a) => a.sectionId === e.sectionId && a.subjectId === e.subjectId && a.semesterId === e.semesterId);
    if (!teacher || teacher.facultyId !== e.facultyId || !input.faculty.some((f) => f.id === e.facultyId && f.assignable && f.teachingLevels.includes(section.level))) throw new AutoScheduleError("The assigned teacher changed or is unavailable. Generate a new preview.");
    if (!input.rooms.some((r) => r.id === e.roomId && r.assignable)) throw new AutoScheduleError("The proposed room is no longer available to your department.");
    const scheduled = entries.filter((x) => x.status !== "ARCHIVED" && x.semesterId === e.semesterId && x.sectionId === e.sectionId && x.subjectId === e.subjectId && x.component === e.component).reduce((sum, x) => sum + x.endMin - x.startMin, 0);
    const duration = e.endMin - e.startMin;
    if (duration <= 0 || scheduled + duration > need.requiredMin) throw new AutoScheduleError("The remaining subject hours changed. Generate a new preview to avoid duplicate meetings.");
    const lengthError = collegeLengthError(section.level, duration, need.requiredMin - scheduled, input.timetables?.[section.id]?.classSession);
    if (lengthError) throw new AutoScheduleError(lengthError);
    entries.push(e);
  }
  for (const c of changes) {
    const hard = validatePlacement(c.after!, entries.filter((e) => e.id !== c.after!.id), world).find((f) => f.hard);
    if (hard) throw new AutoScheduleError(hard.message);
  }
}

export async function previewAutoSchedule(scope: Scope, sectionIds: string[]) {
  const sections = await prisma.section.findMany({ where: { id: { in: sectionIds }, archivedAt: null }, select: { id: true, semesterId: true } });
  if (sections.length !== sectionIds.length || sections.some((s) => !s.semesterId)) throw new AutoScheduleError("Choose existing sections with an academic term.");
  const termIds = [...new Set(sections.map((s) => s.semesterId!))];
  const input = await serverInput(scope, termIds);
  if (sectionIds.some((id) => !input.sections.some((s) => s.id === id && s.editable))) throw new AutoScheduleError("Choose sections in your department and program scope whose timetables are open for editing.");
  const generatedAt = new Date();
  const proposal = solve(input, { ...DEFAULT_OPTIONS, sectionIds, kinds: ["UNSCHEDULED", "HOURS"], keepFaculty: true, moveCompleteSections: false, retime: false, placementOnly: true });
  const summary = templateSummary(proposal);
  // Store the server-generated changes. Applying accepts ids only, never a timetable supplied by the browser.
  const record = proposal.changes.length ? await prisma.workloadProposal.create({ data: {
    kind: "SCHEDULE_REPAIR", semesterId: termIds[0], departmentId: scope.departmentId, status: "PENDING", createdById: scope.userId,
    items: proposal.changes as unknown as Prisma.InputJsonValue, explanation: summary, generatedAt,
    options: { mode: "AUTO_SCHEDULE", sectionIds, termIds }, basis: autoScheduleBasis(input),
  } }) : null;
  return { proposalId: record?.id ?? null, proposal, summary };
}

export async function applyAutoSchedule(scope: Scope, proposalId: string, acceptedIds: string[]) {
  return prisma.$transaction(async (tx) => {
    // All auto-schedule commits serialize before reading their authoritative world.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
    const record = await tx.workloadProposal.findUnique({ where: { id: proposalId } });
    const options = record?.options as { mode?: string; sectionIds?: string[]; termIds?: string[] } | null;
    if (!record || record.createdById !== scope.userId || record.status !== "PENDING" || record.kind !== "SCHEDULE_REPAIR" || options?.mode !== "AUTO_SCHEDULE" || !options.termIds?.length || !options.sectionIds?.length) throw new AutoScheduleError("This preview is no longer available. Generate a new preview.");
    const input = await serverInput(scope, options.termIds, tx);
    if (record.basis !== autoScheduleBasis(input)) throw new AutoScheduleError("The assignments, queue, or timetable changed after this preview. Generate a new preview.");
    const all = record.items as unknown as Change[];
    const wanted = new Set(acceptedIds);
    const changes = all.filter((c) => wanted.has(c.id));
    if (!changes.length || changes.length !== wanted.size || changes.some((c) => !options.sectionIds!.includes(c.sectionId))) throw new AutoScheduleError("Choose valid meetings from this preview.");
    validateAutoPlacements(input, changes);
    const stored = changes.map((c) => ({ ...c, after: { ...c.after!, id: randomUUID(), status: "DRAFT" as const } }));
    const claimed = await tx.workloadProposal.updateMany({ where: { id: record.id, status: "PENDING", version: record.version }, data: { status: "APPLIED", version: { increment: 1 }, reviewedById: scope.userId, reviewedAt: new Date(), items: stored as unknown as Prisma.InputJsonValue } });
    if (claimed.count !== 1) throw new AutoScheduleError("This preview was already applied. Refresh the timetable.");
    await tx.schedule.createMany({ data: stored.map((c) => ({ ...c.after, departmentId: input.sections.find((s) => s.id === c.sectionId)!.departmentId, generatedBy: scope.userId, notes: "Added by Auto-Schedule; review before submitting." })) });
    await tx.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: scope.departmentId, entity: "WorkloadProposal", entityId: record.id, action: `Applied Auto-Schedule preview: ${stored.length} draft meeting(s)`, newValue: { meetings: stored.length, sectionIds: options.sectionIds } } });
    return stored;
  }, { maxWait: 10_000, timeout: 60_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
