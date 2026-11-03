import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { weeklyDoubleBooking } from "@/lib/scheduler/term-conflicts";
import { notifyFaculty, notifyManagers } from "@/lib/notify";
import { syncAssignmentsForMove } from "@/lib/subjects/assignments";
import { loadWorkload } from "./load";
import { basisOf, explain, loadReport, optimize, type Flag, type Move } from "./optimizer";

/** Latest result of the continuous workload check, kept for the dashboard and Faculty Workload page. */
export const SETTING_WORKLOAD_STATUS = "workloadStatus";

export interface WorkloadStatus {
  checkedAt: string;
  trigger: string;
  proposed: number;
  flags: Flag[];
}

export type WorkloadData = Awaited<ReturnType<typeof loadWorkload>>;

let chain: Promise<unknown> = Promise.resolve();

/** Runs a workload check now; checks run one at a time so two changes never rebalance at once. */
export function runWorkloadCheck(trigger: string, actorId: string | null = null): Promise<WorkloadStatus> {
  const run = chain.then(() => check(trigger, actorId));
  chain = run.catch(() => undefined);
  return run;
}

/** Rechecks every load right after the current response is sent, so the change that triggered it stays fast. */
export function queueWorkloadCheck(trigger: string, actorId: string | null = null) {
  const run = () => runWorkloadCheck(trigger, actorId).catch((e) => console.error("Workload check failed", e));
  try {
    after(run);
  } catch {
    // Outside a request (scripts and the seed) there is no response to wait for, so run now.
    void run();
  }
}

export async function getWorkloadStatus(): Promise<WorkloadStatus | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_WORKLOAD_STATUS } });
  return (row?.value as WorkloadStatus | undefined) ?? null;
}

export async function activeTermIds() {
  return (await prisma.semester.findMany({ where: { isActive: true }, select: { id: true } })).map((t) => t.id);
}

/** Faculty whose loads a department proposal depends on: the department's own plus everyone its rows touch. */
export function proposalFaculty(data: WorkloadData, departmentId: string | null, rows: { fromFacultyId: string; toFacultyId: string }[]) {
  return new Set([...data.faculty.filter((f) => !!departmentId && f.departmentId === departmentId).map((f) => f.id), ...rows.flatMap((r) => [r.fromFacultyId, r.toFacultyId])]);
}

export const proposalBasis = (data: WorkloadData, departmentId: string | null, rows: { fromFacultyId: string; toFacultyId: string }[]) =>
  basisOf([...data.assignments, ...data.unassigned], proposalFaculty(data, departmentId, rows), data.limits);

/** Checks every load and proposes fixes for Head of Department approval; nothing is ever applied here. */
async function check(trigger: string, actorId: string | null): Promise<WorkloadStatus> {
  void actorId;
  const termIds = await activeTermIds();
  const data = await loadWorkload(termIds, null);
  const before = loadReport(data.faculty, data.assignments, data.limits);
  const { moves, after: afterRows, flags } = optimize(data.faculty, data.assignments, data.limits, data.busy, {
    blocked: data.blocked,
    unassigned: data.unassigned,
    inactiveNames: data.inactiveNames,
  });
  const proposed = await syncProposals(data, moves, explain(before, afterRows, moves), termIds[0], trigger);

  const previous = await getWorkloadStatus();
  const status: WorkloadStatus = { checkedAt: new Date().toISOString(), trigger, proposed, flags };
  await prisma.systemSetting.upsert({
    where: { key: SETTING_WORKLOAD_STATUS },
    update: { value: status as never },
    create: { key: SETTING_WORKLOAD_STATUS, value: status as never },
  });

  // Tell each department's Head (and the Administrator) about newly appearing items that need a person.
  const seen = new Set((previous?.flags ?? []).map((f) => f.explanation));
  const deptOf = new Map(data.faculty.map((f) => [f.id, f.departmentId]));
  const fresh = flags.filter((f) => !seen.has(f.explanation));
  for (const dept of new Set(fresh.map((f) => (f.facultyId ? deptOf.get(f.facultyId) ?? null : null)))) {
    const own = fresh.filter((f) => (f.facultyId ? deptOf.get(f.facultyId) ?? null : null) === dept);
    await notifyManagers(dept, {
      title: "Workload needs manual attention",
      message: `${own.length} teaching load issue(s) have no automatic fix. ${own[0].explanation}`,
      link: "/workload",
      type: "WARNING",
    });
  }
  return status;
}

/**
 * One pending proposal per giving department. A pending proposal is kept while the loads it was built on are
 * unchanged (so a Head of Department's edits survive), and superseded and rebuilt as soon as they change.
 */
async function syncProposals(data: WorkloadData, moves: Move[], explanation: string, semesterId: string | undefined, trigger: string) {
  const pending = await prisma.workloadProposal.findMany({ where: { kind: "WORKLOAD", status: "PENDING" }, include: { rows: true } });
  const kept = new Set<string>();
  for (const p of pending) {
    if (p.basis && p.basis === proposalBasis(data, p.departmentId, p.rows)) kept.add(p.departmentId ?? "");
    else await prisma.workloadProposal.update({ where: { id: p.id }, data: { status: "SUPERSEDED", version: { increment: 1 } } });
  }
  if (!semesterId) return kept.size;

  const groups = new Map<string, Move[]>();
  for (const m of moves) groups.set(m.fromDepartmentId ?? "", [...(groups.get(m.fromDepartmentId ?? "") ?? []), m]);
  const names = new Map((await prisma.department.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  for (const [dept, items] of groups) {
    if (kept.has(dept)) continue;
    const departmentId = dept || null;
    await prisma.workloadProposal.create({
      data: {
        semesterId,
        departmentId,
        automatic: true,
        items: [],
        basis: proposalBasis(data, departmentId, items),
        explanation: `Found automatically after: ${trigger}. ${explanation}`,
        createdById: "system",
        rows: { create: items.map((m) => ({ key: m.key, move: m as never, fromFacultyId: m.fromFacultyId, toFacultyId: m.toFacultyId, fromDepartmentId: m.fromDepartmentId, toDepartmentId: m.toDepartmentId })) },
      },
    });
    const message = `${items.length} teaching load reassignment(s) were proposed after: ${trigger}. Review them in Faculty Workload.`;
    await notifyManagers(departmentId, { title: "Workload fixes awaiting approval", message, link: "/workload" });
    // Receiving departments of cross-department rows must approve their side too.
    for (const other of new Set(items.map((m) => m.toDepartmentId).filter((d): d is string => !!d && d !== departmentId))) {
      await notifyManagers(other, { title: "Workload fixes need your approval", message: `${names.get(departmentId ?? "") ?? "Another department"} proposed giving classes to your faculty. Review them in Faculty Workload.`, link: "/workload" });
    }
  }
  return kept.size + [...groups.keys()].filter((d) => !kept.has(d)).length;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Applies validated moves inside the caller's transaction: scheduled classes change teacher, unscheduled
 * assignments change hands, and every move is logged. Throws when a class changed underneath.
 */
export async function applyMoves(tx: Tx, moves: Move[], ctx: { measure: string; actorId: string; proposalId: string }) {
  for (const m of moves) {
    if (m.scheduleIds.length) {
      const { count } = await tx.schedule.updateMany({ where: { id: { in: m.scheduleIds }, facultyId: m.fromFacultyId }, data: { facultyId: m.toFacultyId } });
      if (count !== m.scheduleIds.length) throw new Error("STALE");
      const classes = await tx.schedule.findMany({ where: { id: { in: m.scheduleIds } }, select: { semesterId: true, sectionId: true, subjectId: true } });
      await syncAssignmentsForMove(tx, classes, m.fromFacultyId, m.toFacultyId);
    } else if (m.assignmentId) {
      const { count } = await tx.subjectAssignment.updateMany({ where: { id: m.assignmentId, status: "ACTIVE", facultyId: m.fromFacultyId }, data: { facultyId: m.toFacultyId } });
      if (count !== 1) throw new Error("STALE");
    }
    await tx.workloadFix.create({
      data: {
        mode: "APPROVED", proposalId: ctx.proposalId, trigger: "Approved proposal", assignmentKey: m.key, scheduleIds: m.scheduleIds, label: m.label,
        fromFacultyId: m.fromFacultyId, toFacultyId: m.toFacultyId, measure: ctx.measure, amount: m.amount,
        fromBefore: m.fromBefore, fromAfter: m.fromAfter, toBefore: m.toBefore, toAfter: m.toAfter, reason: m.reason, appliedById: ctx.actorId,
        departmentId: m.fromDepartmentId,
      },
    });
  }
}

/** Returns the class to the original faculty member if that is still conflict free; the pair is never re-proposed. */
export async function undoFix(fixId: string, userId: string): Promise<string | null> {
  const fix = await prisma.workloadFix.findUnique({ where: { id: fixId } });
  if (!fix || fix.undoneAt) return "This fix was already undone.";
  const [meetings, original] = await Promise.all([
    prisma.schedule.findMany({ where: { id: { in: fix.scheduleIds } } }),
    prisma.faculty.findUnique({ where: { id: fix.fromFacultyId }, select: { status: true, fullName: true } }),
  ]);
  if (meetings.length !== fix.scheduleIds.length || meetings.some((s) => s.facultyId !== fix.toFacultyId)) return "The class has changed since this fix, so it cannot be undone automatically.";
  if (original?.status !== "ACTIVE") return `${original?.fullName ?? "The original faculty member"} is no longer active.`;
  const clash = (await Promise.all(meetings.map((s) => weeklyDoubleBooking({ ...s, facultyId: fix.fromFacultyId }, s.id)))).find(Boolean);
  if (clash) return `Undoing would create a conflict. ${clash}`;

  const plannedId = fix.assignmentKey.startsWith("plan|") ? fix.assignmentKey.slice(5) : null;
  const moved = await prisma.$transaction(async (tx) => {
    // An unscheduled subject goes back by handing its assignment back.
    if (plannedId && (await tx.subjectAssignment.updateMany({ where: { id: plannedId, status: "ACTIVE", facultyId: fix.toFacultyId }, data: { facultyId: fix.fromFacultyId } })).count !== 1) return false;
    await tx.schedule.updateMany({ where: { id: { in: fix.scheduleIds } }, data: { facultyId: fix.fromFacultyId } });
    await tx.workloadFix.update({ where: { id: fixId }, data: { undoneAt: new Date(), undoneById: userId } });
    await syncAssignmentsForMove(tx, meetings, fix.toFacultyId, fix.fromFacultyId);
    return true;
  });
  if (!moved) return "The subject assignment has changed since this fix, so it cannot be undone automatically.";
  await notifyFaculty([fix.fromFacultyId, fix.toFacultyId], {
    title: "Teaching load change undone",
    message: `${fix.label} is back with ${original.fullName}. The fix was undone and will not be proposed again.`,
    link: "/workload",
  });
  queueWorkloadCheck(`A workload fix was undone (${fix.label})`, userId);
  return null;
}
