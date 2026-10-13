import "server-only";
import { after } from "next/server";
import type { FixMode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getWorkloadSettings, type WorkloadSettings } from "@/lib/settings";
import { weeklyDoubleBooking } from "@/lib/scheduler/term-conflicts";
import { notifyFaculty, notifyManagers } from "@/lib/notify";
import { loadWorkload } from "./load";
import { explain, loadReport, optimize, type Flag, type Move } from "./optimizer";

/** Latest result of the continuous workload check, kept for the dashboard and Faculty Workload page. */
export const SETTING_WORKLOAD_STATUS = "workloadStatus";

export interface WorkloadStatus {
  checkedAt: string;
  trigger: string;
  mode: WorkloadSettings["mode"];
  applied: number;
  proposed: number;
  flags: Flag[];
}

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

async function activeTermIds() {
  return (await prisma.semester.findMany({ where: { isActive: true }, select: { id: true } })).map((t) => t.id);
}

async function check(trigger: string, actorId: string | null): Promise<WorkloadStatus> {
  const termIds = await activeTermIds();
  const data = await loadWorkload(termIds, null);
  const before = loadReport(data.faculty, data.assignments, data.limits);
  const { moves, after: afterRows, flags } = optimize(data.faculty, data.assignments, data.limits, data.busy, {
    blocked: data.blocked,
    unassigned: data.unassigned,
    inactiveNames: data.inactiveNames,
  });

  let applied = 0;
  let proposed = 0;
  if (data.limits.mode === "AUTOMATIC") {
    const result = await applyMoves(moves, { mode: "AUTOMATIC", trigger, actorId });
    applied = result.applied.length;
    flags.push(...result.skipped.map((s) => ({ kind: "NOT_APPLIED" as const, facultyId: null, label: s.label, explanation: s.reason })));
    await prisma.workloadProposal.updateMany({ where: { automatic: true, status: "PENDING" }, data: { status: "SUPERSEDED" } });
  } else {
    proposed = await syncProposals(moves, explain(before, afterRows, moves), termIds[0], data.faculty, trigger);
  }

  const previous = await getWorkloadStatus();
  const status: WorkloadStatus = { checkedAt: new Date().toISOString(), trigger, mode: data.limits.mode, applied, proposed, flags };
  await prisma.systemSetting.upsert({
    where: { key: SETTING_WORKLOAD_STATUS },
    update: { value: status as never },
    create: { key: SETTING_WORKLOAD_STATUS, value: status as never },
  });

  // Tell managers only about newly appearing items that need a person.
  const seen = new Set((previous?.flags ?? []).map((f) => f.explanation));
  const fresh = flags.filter((f) => f.kind !== "UNDERLOADED" && !seen.has(f.explanation));
  if (fresh.length) {
    await notifyManagers(null, {
      title: "Workload needs manual attention",
      message: `${fresh.length} teaching load issue(s) could not be fixed automatically. ${fresh[0].explanation}`,
      link: "/workload",
      type: "WARNING",
    });
  }
  return status;
}

/** One proposal per department (cross-department moves go to the Administrator), replaced only when the moves change. */
async function syncProposals(moves: Move[], explanation: string, semesterId: string | undefined, faculty: { id: string; departmentId: string | null }[], trigger: string) {
  const pending = await prisma.workloadProposal.findMany({ where: { automatic: true, status: "PENDING" } });
  const signature = (ms: Move[]) => ms.map((m) => `${m.key}>${m.toFacultyId}`).sort().join(",");
  if (signature(pending.flatMap((p) => p.items as unknown as Move[])) === signature(moves)) return pending.length;

  await prisma.workloadProposal.updateMany({ where: { automatic: true, status: "PENDING" }, data: { status: "SUPERSEDED" } });
  if (moves.length === 0 || !semesterId) return 0;

  const deptOf = new Map(faculty.map((f) => [f.id, f.departmentId]));
  const groups = new Map<string, Move[]>();
  for (const m of moves) {
    const from = deptOf.get(m.fromFacultyId) ?? null;
    const dept = from && from === deptOf.get(m.toFacultyId) ? from : "";
    groups.set(dept, [...(groups.get(dept) ?? []), m]);
  }
  for (const [dept, items] of groups) {
    await prisma.workloadProposal.create({
      data: {
        semesterId,
        departmentId: dept || null,
        automatic: true,
        items: items as never,
        explanation: `Found automatically after: ${trigger}. ${explanation}`,
        createdById: "system",
      },
    });
    await notifyManagers(dept || null, {
      title: "Workload fixes awaiting approval",
      message: `${items.length} teaching load reassignment(s) were proposed after: ${trigger}. Approve them in Faculty Workload.`,
      link: "/workload",
    });
  }
  return groups.size;
}

/** Current load of one faculty member in the active terms, in the configured measure. */
async function currentLoad(facultyId: string, measure: WorkloadSettings["measure"], termIds: string[]) {
  const rows = await prisma.schedule.findMany({
    where: { facultyId, semesterId: { in: termIds }, status: { not: "ARCHIVED" } },
    select: { startMin: true, endMin: true, sectionId: true, subjectId: true, subject: { select: { units: true } } },
  });
  if (measure === "HOURS") return Math.round((rows.reduce((s, r) => s + r.endMin - r.startMin, 0) / 60) * 10) / 10;
  return [...new Map(rows.map((r) => [`${r.sectionId}|${r.subjectId}`, r.subject.units])).values()].reduce((s, u) => s + u, 0);
}

/**
 * Applies moves one by one, each re-validated against the live timetable: the class must still belong to
 * the original faculty member and the new one must stay free at every meeting. Every applied move is
 * logged with both loads before and after, and both faculty members are notified.
 */
export async function applyMoves(moves: Move[], ctx: { mode: FixMode; trigger: string; actorId: string | null; proposalId?: string }) {
  const { measure } = await getWorkloadSettings();
  const termIds = await activeTermIds();
  const unit = measure === "HOURS" ? "hours" : "units";
  const applied: string[] = [];
  const skipped: { label: string; reason: string }[] = [];

  for (const m of moves) {
    const meetings = await prisma.schedule.findMany({ where: { id: { in: m.scheduleIds } } });
    if (meetings.length !== m.scheduleIds.length || meetings.some((s) => s.facultyId !== m.fromFacultyId)) {
      skipped.push({ label: m.label, reason: `${m.label} changed since the fix was computed, so it was left as is.` });
      continue;
    }
    const clash = (await Promise.all(meetings.map((s) => weeklyDoubleBooking({ ...s, facultyId: m.toFacultyId }, s.id)))).find(Boolean);
    if (clash) {
      skipped.push({ label: m.label, reason: `${m.label} was not moved because it would create a conflict. ${clash}` });
      continue;
    }

    const [fromBefore, toBefore] = await Promise.all([currentLoad(m.fromFacultyId, measure, termIds), currentLoad(m.toFacultyId, measure, termIds)]);
    const fix = await prisma.$transaction(async (tx) => {
      const { count } = await tx.schedule.updateMany({ where: { id: { in: m.scheduleIds }, facultyId: m.fromFacultyId }, data: { facultyId: m.toFacultyId } });
      if (count !== m.scheduleIds.length) throw new Error("changed");
      return tx.workloadFix.create({
        data: {
          mode: ctx.mode, proposalId: ctx.proposalId, trigger: ctx.trigger, assignmentKey: m.key, scheduleIds: m.scheduleIds, label: m.label,
          fromFacultyId: m.fromFacultyId, toFacultyId: m.toFacultyId, measure, amount: m.amount,
          fromBefore, fromAfter: Math.round((fromBefore - m.amount) * 10) / 10, toBefore, toAfter: Math.round((toBefore + m.amount) * 10) / 10,
          reason: m.reason, appliedById: ctx.actorId,
        },
      });
    }).catch(() => null);
    if (!fix) {
      skipped.push({ label: m.label, reason: `${m.label} changed while the fix was applied, so it was left as is.` });
      continue;
    }
    applied.push(fix.id);
    const names = await prisma.faculty.findMany({ where: { id: { in: [m.fromFacultyId, m.toFacultyId] } }, select: { id: true, fullName: true } });
    const name = (id: string) => names.find((n) => n.id === id)?.fullName ?? "a colleague";
    await notifyFaculty([m.fromFacultyId], { title: "Your teaching load changed", message: `${m.label} moved to ${name(m.toFacultyId)}. Your load is now ${fix.fromAfter} ${unit}. ${m.reason}`, link: "/workload" });
    await notifyFaculty([m.toFacultyId], { title: "Your teaching load changed", message: `You now teach ${m.label} (from ${name(m.fromFacultyId)}). Your load is now ${fix.toAfter} ${unit}. ${m.reason}`, link: "/workload" });
  }
  return { applied, skipped };
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

  await prisma.$transaction([
    prisma.schedule.updateMany({ where: { id: { in: fix.scheduleIds } }, data: { facultyId: fix.fromFacultyId } }),
    prisma.workloadFix.update({ where: { id: fixId }, data: { undoneAt: new Date(), undoneById: userId } }),
  ]);
  await notifyFaculty([fix.fromFacultyId, fix.toFacultyId], {
    title: "Teaching load change undone",
    message: `${fix.label} is back with ${original.fullName}. The automatic fix was undone and will not be repeated.`,
    link: "/workload",
  });
  queueWorkloadCheck(`A workload fix was undone (${fix.label})`, userId);
  return null;
}
