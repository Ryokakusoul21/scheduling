"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { logBlocked } from "@/lib/permissions/department";
import { canManageSubject, canViewSubject } from "@/lib/subjects/permissions";
import { assignmentWarnings } from "@/lib/subjects/assignment-rules";
import { planSchema, type PlanInput } from "@/lib/subjects/plan";
import { assignableFaculty } from "@/lib/subjects/assignments";
import { formatRange } from "@/lib/scheduler/timetable";
import { notifyFacultyEach } from "@/lib/notify";
import { queueWorkloadCheck } from "@/lib/workload/auto";

type Result = { ok: true; warnings: string[]; changed: number } | { ok: false; error: string };

const GENERAL_EDUCATION_ONLY = "This subject is managed by another department. Use Request assignment so its Head of Department can assign it.";
const day = (d: string) => `${d[0]}${d.slice(1).toLowerCase()}`;

function revalidate() {
  for (const path of ["/subjects", "/scheduler", "/workload", "/my-subjects", "/sections", "/analytics"]) revalidatePath(path);
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

  const [subjects, term, sections, pool] = await Promise.all([
    prisma.subject.findMany({ where: { id: { in: subjectIds }, archivedAt: null }, select: { id: true, code: true, units: true, lectureHours: true, labHours: true, departmentId: true, department: { select: { name: true } } } }),
    prisma.semester.findUnique({ where: { id: semesterId }, select: { name: true, academicYear: { select: { name: true } } } }),
    sectionIds.length ? prisma.section.findMany({ where: { id: { in: sectionIds }, archivedAt: null }, select: { id: true, name: true, semesterId: true } }) : [],
    assignableFaculty(semesterId),
  ]);
  if (subjects.length !== subjectIds.length) return { ok: false, error: "One of the subjects was archived or removed. Refresh and try again." };
  if (!term) return { ok: false, error: "Choose a valid term." };
  if (sections.length !== sectionIds.length || sections.some((s) => s.semesterId && s.semesterId !== semesterId)) return { ok: false, error: "A chosen section does not belong to this term." };
  const people = new Map(pool.faculty.map((f) => [f.id, f]));
  if (facultyIds.some((id) => !people.has(id))) return { ok: false, error: "A chosen faculty member is not active." };
  const blocked = subjects.find((s) => !canManageSubject(scope, s));
  if (blocked) {
    await logBlocked(scope, `assign ${blocked.code} outside the department`, "SubjectAssignment", blocked.id);
    return { ok: false, error: GENERAL_EDUCATION_ONLY };
  }

  const existing = await prisma.subjectAssignment.findMany({
    where: { status: "ACTIVE", semesterId, subjectId: { in: subjectIds } },
    select: { id: true, subjectId: true, sectionId: true, facultyId: true, faculty: { select: { fullName: true } } },
  });
  const ops = subjects.flatMap((subject) => changes.flatMap((c) => {
    const prev = existing.find((e) => e.subjectId === subject.id && (e.sectionId ?? "") === (c.sectionId ?? ""));
    if (!c.facultyId ? !prev : prev?.facultyId === c.facultyId) return [];
    return [{ subject, prev, change: c }];
  }));
  if (!ops.length) return { ok: true, warnings: [], changed: 0 };

  const where = (sectionId: string | null) => `${term.name} ${term.academicYear.name}, ${sectionId ? `section ${sections.find((s) => s.id === sectionId)?.name}` : "all sections"}`;
  try {
    await prisma.$transaction(async (tx) => {
      const replaced = ops.flatMap((o) => (o.prev ? [o.prev.id] : []));
      if (replaced.length) await tx.subjectAssignment.updateMany({ where: { id: { in: replaced } }, data: { status: "ARCHIVED" } });
      const added = ops.filter((o) => o.change.facultyId);
      if (added.length) await tx.subjectAssignment.createMany({ data: added.map((o) => ({ subjectId: o.subject.id, facultyId: o.change.facultyId!, sectionId: o.change.sectionId, semesterId, assignedById: scope.userId })) });
      await tx.auditLog.createMany({
        data: ops.map(({ subject, prev, change }) => {
          const to = change.facultyId ? people.get(change.facultyId)!.name : null;
          return {
            userId: scope.userId, role: scope.role, departmentId: subject.departmentId, entity: "SubjectAssignment", entityId: subject.id,
            action: to
              ? `${prev ? "Reassigned" : "Assigned"} ${subject.code} to ${to} (${where(change.sectionId)})`
              : `Removed ${prev!.faculty.fullName} from ${subject.code} (${where(change.sectionId)})`,
            oldValue: prev ? { facultyId: prev.facultyId, facultyName: prev.faculty.fullName, sectionId: prev.sectionId } : undefined,
            newValue: change.facultyId ? { facultyId: change.facultyId, facultyName: to, sectionId: change.sectionId, semesterId } : undefined,
          };
        }),
      });
    });
  } catch {
    return { ok: false, error: "Someone changed these assignments at the same time. Refresh and try again." };
  }

  // Tell everyone who gained or lost a subject, one message each.
  const notices = new Map<string, string[]>();
  const note = (id: string, text: string) => notices.set(id, [...(notices.get(id) ?? []), text]);
  for (const { subject, prev, change } of ops) {
    if (change.facultyId) note(change.facultyId, `You were assigned ${subject.code} (${where(change.sectionId)}).`);
    if (prev && prev.facultyId !== change.facultyId) note(prev.facultyId, change.facultyId ? `${subject.code} (${where(change.sectionId)}) is now assigned to ${people.get(change.facultyId)!.name}.` : `You are no longer assigned ${subject.code} (${where(change.sectionId)}).`);
  }
  await notifyFacultyEach([...notices].map(([id, lines]) => ({ facultyIds: [id], msg: { title: "Subject assignments updated", message: lines.join(" "), link: "/my-subjects" } })));
  queueWorkloadCheck("Subject assignments changed", scope.userId);
  revalidate();

  const warnings = facultyIds.flatMap((id) => {
    const gained = ops.filter((o) => o.change.facultyId === id).map((o) => ({ ...o.subject, departmentName: o.subject.department?.name ?? null }));
    return gained.length ? assignmentWarnings(people.get(id)!, [...new Map(gained.map((s) => [s.id, s])).values()], pool.measure) : [];
  });
  const handedOver = ops.filter((o) => o.prev && o.prev.facultyId !== o.change.facultyId);
  const stale = handedOver.length ? await prisma.schedule.count({
    where: { semesterId, status: { not: "ARCHIVED" }, OR: handedOver.map((o) => ({ subjectId: o.subject.id, facultyId: o.prev!.facultyId, ...(o.change.sectionId ? { sectionId: o.change.sectionId } : {}) })) },
  }) : 0;
  if (stale) warnings.push(`${stale} scheduled meeting${stale > 1 ? "s are" : " is"} still taught by the previous faculty. Update ${stale > 1 ? "them" : "it"} in the Scheduler.`);
  return { ok: true, warnings, changed: ops.length };
}

const checkSchema = z.object({
  subjectIds: z.array(z.string().min(1)).min(1).max(100),
  semesterId: z.string().min(1),
  facultyId: z.string().min(1),
  sectionId: z.string().nullable(),
});

/** Class-time clashes between the subject's scheduled meetings and the faculty member's other classes this term. */
export async function assignmentConflictsAction(input: z.input<typeof checkSchema>): Promise<string[]> {
  await requireScope(...STAFF_ROLES);
  const parsed = checkSchema.safeParse(input);
  if (!parsed.success) return [];
  const { subjectIds, semesterId, facultyId, sectionId } = parsed.data;
  const base = { semesterId, status: { not: "ARCHIVED" as const } };
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
      where: { subjectId, semesterId, status: { not: "ARCHIVED" } },
      orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
      select: { facultyId: true, dayOfWeek: true, startMin: true, endMin: true, faculty: { select: { fullName: true } }, section: { select: { name: true } }, room: { select: { roomNumber: true } } },
    }),
  ]);
  return {
    history: logs.map((l) => ({ id: l.id, text: l.action, who: l.user?.name ?? "System", at: l.createdAt.toISOString() })),
    meetings: meetings.map((m) => ({ facultyId: m.facultyId, facultyName: m.faculty.fullName, sectionName: m.section.name, day: day(m.dayOfWeek), time: formatRange(m.startMin, m.endMin), room: m.room.roomNumber })),
  };
}
