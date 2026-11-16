"use server";

import { submittedTimetableFilter } from "@/lib/scheduler/visibility";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { canViewSubject } from "@/lib/subjects/permissions";
import { facultyAssignmentRoute } from "@/lib/subjects/assignment-access";
import { assignmentWarnings } from "@/lib/subjects/assignment-rules";
import { planSchema, projectedLoads, type PlanInput } from "@/lib/subjects/plan";
import { offeringMatches } from "@/lib/subjects/offerings";
import { AssignmentCurriculumError, syncAssignedCurriculum } from "@/lib/subjects/assignment-curriculum";
import { assignableFaculty } from "@/lib/subjects/assignments";
import { formatRange } from "@/lib/scheduler/timetable";
import { notifyFacultyEach, notifyManagers } from "@/lib/notify";
import { queueWorkloadCheck } from "@/lib/workload/auto";

type Result = { ok: true; warnings: string[]; changed: number; assigned?: number; proposed?: number } | { ok: false; error: string };
const day = (d: string) => `${d[0]}${d.slice(1).toLowerCase()}`;

function revalidate() {
  for (const path of ["/subjects", "/scheduler", "/workload", "/my-subjects", "/sections", "/analytics", "/assignment-approvals"]) revalidatePath(path);
}

/** Applies a plan of per-section changes (assign, replace, remove) to one or more subjects in one transaction. */
export async function saveAssignmentPlanAction(input: PlanInput): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const { subjectIds, semesterId } = parsed.data;
  // The last change for a section wins.
  const changes = [...new Map(parsed.data.changes.map((c) => [c.sectionId ?? "", c])).values()];
  const sectionIds = [...new Set(changes.flatMap((c) => (c.sectionId ? [c.sectionId] : [])))];
  const facultyIds = [...new Set(changes.flatMap((c) => (c.facultyId ? [c.facultyId] : [])))];

  const [subjects, term, sections, pool, meetings] = await Promise.all([
    prisma.subject.findMany({ where: { id: { in: subjectIds }, archivedAt: null }, include: { department: { select: { name: true } }, sharedPrograms: { select: { id: true } } } }),
    prisma.semester.findUnique({ where: { id: semesterId }, select: { id: true, name: true, type: true, level: true, programId: true, academicYear: { select: { name: true } } } }),
    prisma.section.findMany({ where: { id: { in: sectionIds }, archivedAt: null }, include: { classPlaceholders: { select: { subjectId: true } } } }),
    assignableFaculty(semesterId),
    prisma.schedule.findMany({ where: { semesterId, subjectId: { in: subjectIds }, sectionId: { in: sectionIds }, status: { not: "ARCHIVED" } }, select: { subjectId: true, sectionId: true, startMin: true, endMin: true } }),
  ]);
  if (subjects.length !== subjectIds.length) return { ok: false, error: "One of the subjects was archived or removed. Refresh and try again." };
  if (!term) return { ok: false, error: "Choose a valid term." };
  if (sections.length !== sectionIds.length || sections.some((s) => s.semesterId && s.semesterId !== semesterId)) return { ok: false, error: "A chosen section does not belong to this term." };
  // Academic levels are never mixed: subjects, sections, and the term share one level.
  if (subjects.some((x) => x.level !== term.level) || sections.some((x) => x.level !== term.level)) return { ok: false, error: "Subjects, sections, and the term must belong to the same academic level." };
  const actor = policyUserFromScope(scope);
  if (sections.some((section) => !can(actor, "edit", { type: "section", ...section }))) {
    return { ok: false, error: "You can assign teachers only to sections in your department and program scope." };
  }
  if (subjects.some((subject) => sections.some((section) =>
    !offeringMatches({ ...subject, sharedProgramIds: subject.sharedPrograms.map((p) => p.id) }, { ...section, curriculum: section.classPlaceholders }, term) ||
    (term.programId && term.programId !== section.programId)))) {
    return { ok: false, error: "Choose sections whose program, year or grade, curriculum, and semester match every selected subject." };
  }
  const people = new Map(pool.faculty.map((f) => [f.id, f]));
  if (facultyIds.some((id) => !people.has(id))) return { ok: false, error: "A chosen faculty member is not active." };
  if (facultyIds.some((id) => facultyAssignmentRoute(actor, people.get(id)!.departmentId) === "DENIED")) return { ok: false, error: "Choose faculty with a department that can authorize this assignment." };

  const existing = await prisma.subjectAssignment.findMany({
    where: { status: "ACTIVE", semesterId, subjectId: { in: subjectIds } },
    select: { id: true, subjectId: true, sectionId: true, facultyId: true, faculty: { select: { fullName: true, departmentId: true } } },
  });
  const ops = subjects.flatMap((subject) => changes.flatMap((c) => {
    const prev = existing.find((e) => e.subjectId === subject.id && (e.sectionId ?? "") === (c.sectionId ?? ""));
    if (!c.facultyId ? !prev : prev?.facultyId === c.facultyId) return [];
    return [{ subject, prev, change: c }];
  }));
  if (ops.some((o) => !o.change.facultyId && o.prev && facultyAssignmentRoute(actor, o.prev.faculty.departmentId) !== "DIRECT")) return { ok: false, error: "A Registrar or the faculty department must authorize removing this teacher." };
  const direct = ops.filter((o) => !o.change.facultyId || facultyAssignmentRoute(actor, people.get(o.change.facultyId)!.departmentId) === "DIRECT");
  const proposed = ops.filter((o) => o.change.facultyId && facultyAssignmentRoute(actor, people.get(o.change.facultyId)!.departmentId) === "APPROVAL");
  if (!ops.length) {
    try {
      await prisma.$transaction((tx) => syncAssignedCurriculum(tx, subjects.flatMap((s) => changes.filter((c) => c.facultyId).map((c) => ({ subjectId: s.id, sectionId: c.sectionId, semesterId })))));
      revalidate();
      return { ok: true, warnings: [], changed: 0 };
    } catch (error) {
      if (error instanceof AssignmentCurriculumError) return { ok: false, error: error.message };
      throw error;
    }
  }
  const projections = projectedLoads(pool.faculty, subjects.map((subject) => ({
    ...subject, departmentName: subject.department?.name ?? null,
    assignments: existing.filter((a) => a.subjectId === subject.id),
    progress: sections.map((s) => ({ sectionId: s.id, scheduledHours: meetings.filter((m) => m.subjectId === subject.id && m.sectionId === s.id).reduce((sum, m) => sum + Math.max(0, m.endMin - m.startMin) / 60, 0) })),
  })), changes, pool.measure);

  const where = (sectionId: string | null) => `${term.name} ${term.academicYear.name}, ${sectionId ? `section ${sections.find((s) => s.id === sectionId)?.name}` : "all sections"}`;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
      const pending = await tx.subjectAssignmentProposal.findMany({ where: { status: "PENDING", semesterId, subjectId: { in: subjectIds }, sectionId: { in: sectionIds } }, select: { subjectId: true, sectionId: true } });
      if (ops.some((o) => pending.some((p) => p.subjectId === o.subject.id && p.sectionId === o.change.sectionId))) throw new AssignmentCurriculumError("A pending proposal already exists for one of these subject sections. Review or cancel it before changing the assignment.");
      const current = await tx.subjectAssignment.findMany({ where: { status: "ACTIVE", semesterId, subjectId: { in: subjectIds }, sectionId: { in: sectionIds } }, select: { id: true, subjectId: true, sectionId: true, facultyId: true } });
      if (ops.some((o) => {
        const now = current.find((a) => a.subjectId === o.subject.id && a.sectionId === o.change.sectionId);
        return now?.id !== o.prev?.id || now?.facultyId !== o.prev?.facultyId;
      })) throw new AssignmentCurriculumError("An assignment changed while you were reviewing. Refresh and review the current teacher.");
      const replaced = direct.flatMap((o) => (o.prev ? [o.prev.id] : []));
      if (replaced.length) await tx.subjectAssignment.updateMany({ where: { id: { in: replaced } }, data: { status: "ARCHIVED" } });
      const added = direct.filter((o) => o.change.facultyId);
      if (added.length) await tx.subjectAssignment.createMany({ data: added.map((o) => ({ subjectId: o.subject.id, facultyId: o.change.facultyId!, sectionId: o.change.sectionId, semesterId, assignedById: scope.userId })) });
      await syncAssignedCurriculum(tx, added.map((o) => ({ subjectId: o.subject.id, sectionId: o.change.sectionId, semesterId })));
      if (proposed.length) await tx.subjectAssignmentProposal.createMany({ data: proposed.map((o) => ({ subjectId: o.subject.id, sectionId: o.change.sectionId, facultyId: o.change.facultyId!, semesterId, reviewDepartmentId: people.get(o.change.facultyId!)!.departmentId!, requestedById: scope.userId })) });
      await tx.auditLog.createMany({
        data: ops.map(({ subject, prev, change }) => {
          const to = change.facultyId ? people.get(change.facultyId)!.name : null;
          return {
            userId: scope.userId, role: scope.role, departmentId: sections.find((s) => s.id === change.sectionId)?.departmentId, entity: proposed.some((o) => o.subject.id === subject.id && o.change.sectionId === change.sectionId) ? "SubjectAssignmentProposal" : "SubjectAssignment", entityId: subject.id,
            action: change.facultyId && facultyAssignmentRoute(actor, people.get(change.facultyId)!.departmentId) === "APPROVAL"
              ? `Proposed ${subject.code} for ${to} (${where(change.sectionId)})`
              : to
              ? `${prev ? "Reassigned" : "Assigned"} ${subject.code} to ${to} (${where(change.sectionId)})`
              : `Removed ${prev!.faculty.fullName} from ${subject.code} (${where(change.sectionId)})`,
            oldValue: prev ? { facultyId: prev.facultyId, facultyName: prev.faculty.fullName, sectionId: prev.sectionId } : undefined,
            newValue: change.facultyId ? { facultyId: change.facultyId, facultyName: to, sectionId: change.sectionId, semesterId } : undefined,
          };
        }),
      });
    });
  } catch (error) {
    if (error instanceof AssignmentCurriculumError) return { ok: false, error: error.message };
    return { ok: false, error: "Someone changed these assignments at the same time. Refresh and try again." };
  }

  // Tell everyone who gained or lost a subject, one message each.
  const notices = new Map<string, string[]>();
  const note = (id: string, text: string) => notices.set(id, [...(notices.get(id) ?? []), text]);
  for (const { subject, prev, change } of direct) {
    if (change.facultyId) note(change.facultyId, `You were assigned ${subject.code} (${where(change.sectionId)}).`);
    if (prev && prev.facultyId !== change.facultyId) note(prev.facultyId, change.facultyId ? `${subject.code} (${where(change.sectionId)}) is now assigned to ${people.get(change.facultyId)!.name}.` : `You are no longer assigned ${subject.code} (${where(change.sectionId)}).`);
  }
  await notifyFacultyEach([...notices].map(([id, lines]) => ({ facultyIds: [id], msg: { title: "Subject assignments updated", message: lines.join(" "), link: "/my-subjects" } })));
  const reviews = new Map<string, string[]>();
  for (const o of proposed) {
    const person = people.get(o.change.facultyId!)!;
    reviews.set(person.departmentId!, [...(reviews.get(person.departmentId!) ?? []), `${o.subject.code} for ${sections.find((s) => s.id === o.change.sectionId)?.name} is proposed for ${person.name}.`]);
  }
  for (const [departmentId, lines] of reviews) await notifyManagers(departmentId, { title: "Subject assignment needs review", message: lines.join(" "), link: "/assignment-approvals" });
  if (direct.length) queueWorkloadCheck("Subject assignments changed", scope.userId);
  revalidate();

  const changedFacultyIds = new Set([...facultyIds, ...ops.flatMap((o) => o.prev ? [o.prev.facultyId] : [])]);
  const warnings = [...changedFacultyIds].flatMap((id) => {
    const person = people.get(id);
    if (!person) return [];
    const gained = ops.filter((o) => o.change.facultyId === id).map((o) => ({ ...o.subject, departmentName: o.subject.department?.name ?? null }));
    const projected = projections.get(id);
    return assignmentWarnings(person, [...new Map(gained.map((s) => [s.id, s])).values()], pool.measure, [], projected ? projected.after - projected.before : 0);
  });
  const stale = direct.length ? await prisma.schedule.count({
    where: { semesterId, status: { not: "ARCHIVED" }, OR: direct.map((o) => ({ subjectId: o.subject.id, sectionId: o.change.sectionId, ...(o.change.facultyId ? { facultyId: { not: o.change.facultyId } } : {}) })) },
  }) : 0;
  if (stale) warnings.push(`${stale} scheduled meeting${stale > 1 ? "s are" : " is"} still taught by the previous faculty. Update ${stale > 1 ? "them" : "it"} in the Scheduler.`);
  return { ok: true, warnings, changed: ops.length, assigned: direct.length, proposed: proposed.length };
}

const checkSchema = z.object({
  subjectIds: z.array(z.string().min(1)).min(1).max(100),
  semesterId: z.string().min(1),
  facultyId: z.string().min(1),
  sectionId: z.string().nullable(),
});

/** Class-time clashes between the subject's scheduled meetings and the faculty member's other classes this term. */
export async function assignmentConflictsAction(input: z.input<typeof checkSchema>): Promise<string[]> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = checkSchema.safeParse(input);
  if (!parsed.success) return [];
  const { subjectIds, semesterId, facultyId, sectionId } = parsed.data;
  const base = { semesterId, status: { not: "ARCHIVED" as const }, ...submittedTimetableFilter(scope.role) };
  const [mine, theirs] = await Promise.all([
    prisma.schedule.findMany({ where: { ...base, subjectId: { in: subjectIds }, ...(sectionId ? { sectionId } : {}) }, select: { id: true, dayOfWeek: true, startMin: true, endMin: true, subject: { select: { code: true } }, section: { select: { name: true } } } }),
    prisma.schedule.findMany({ where: { ...base, facultyId }, select: { id: true, dayOfWeek: true, startMin: true, endMin: true, subject: { select: { code: true } }, section: { select: { name: true } } } }),
  ]);
  const mineIds = new Set(mine.map((m) => m.id));
  const out = new Set<string>();
  for (const a of mine) {
    for (const b of theirs) {
      if (mineIds.has(b.id) || a.dayOfWeek !== b.dayOfWeek || a.startMin >= b.endMin || b.startMin >= a.endMin) continue;
      out.add(`${a.subject.code} (${a.section.name}) on ${day(a.dayOfWeek)} ${formatRange(a.startMin, a.endMin)} overlaps their ${b.subject.code} (${b.section.name}) at ${formatRange(b.startMin, b.endMin)}`);
    }
  }
  return [...out].slice(0, 5);
}

export type SubjectDetails = {
  history: { id: string; text: string; who: string; at: string }[];
  meetings: { facultyId: string; facultyName: string; sectionName: string; day: string; time: string; room: string }[];
};

/** Read-only history and class meetings for one subject and term; only for subjects the caller may see. */
export async function subjectDetailsAction(subjectId: string, semesterId: string): Promise<SubjectDetails | null> {
  const scope = await requireScope(...STAFF_ROLES);
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { departmentId: true, programId: true, archivedAt: true } });
  if (!subject || !canViewSubject(scope, { ...subject, shared: !subject.programId })) return null;
  const [logs, meetings] = await Promise.all([
    prisma.auditLog.findMany({ where: { entity: "SubjectAssignment", entityId: subjectId }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, action: true, createdAt: true, user: { select: { name: true } } } }),
    prisma.schedule.findMany({
      where: { subjectId, semesterId, status: { not: "ARCHIVED" }, ...submittedTimetableFilter(scope.role) },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
      select: { facultyId: true, dayOfWeek: true, startMin: true, endMin: true, faculty: { select: { fullName: true } }, section: { select: { name: true } }, room: { select: { roomNumber: true } } },
    }),
  ]);
  return {
    history: logs.map((l) => ({ id: l.id, text: l.action, who: l.user?.name ?? "System", at: l.createdAt.toISOString() })),
    meetings: meetings.map((m) => ({ facultyId: m.facultyId, facultyName: m.faculty.fullName, sectionName: m.section.name, day: day(m.dayOfWeek), time: formatRange(m.startMin, m.endMin), room: m.room.roomNumber })),
  };
}
