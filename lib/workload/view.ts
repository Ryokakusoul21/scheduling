import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatRange, DAY_LONG } from "@/lib/scheduler/timetable";
import type { Scope } from "@/lib/permissions/scope";
import { loadWorkload } from "./load";
import { amountOf, loadReport, type LoadRow, type Move } from "./optimizer";
import { getWorkloadStatus } from "./auto";

export interface FacultyLoadView extends LoadRow {
  department: string;
  classes: { label: string; amount: number; when: string }[];
}

export interface FixView {
  id: string;
  mode: "AUTOMATIC" | "APPROVED";
  label: string;
  from: string;
  to: string;
  amount: number;
  measure: string;
  fromBefore: number;
  fromAfter: number;
  toBefore: number;
  toAfter: number;
  reason: string;
  trigger: string;
  appliedAt: string;
  undoneAt: string | null;
  canUndo: boolean;
}

export interface ProposalView {
  id: string;
  status: string;
  automatic: boolean;
  createdAt: string;
  explanation: string;
  narrative: string | null;
  canReview: boolean;
  moves: (Move & { from: string; to: string })[];
}

/**
 * Everything the workload screens show for the viewer: loads across the active terms (own load for Faculty,
 * own department for a Head of Department, everyone for the Administrator), the latest automatic check,
 * proposals, and the fix log.
 */
export async function workloadView(scope: Scope, opts: { history?: number } = {}) {
  const termIds = (await prisma.semester.findMany({ where: { isActive: true }, select: { id: true } })).map((t) => t.id);
  const department = scope.isAdmin || scope.role === "FACULTY" ? null : scope.manageDepartmentId;
  const [{ limits, faculty, assignments }, status] = await Promise.all([loadWorkload(termIds, department), getWorkloadStatus()]);
  const visible = scope.role === "FACULTY" ? faculty.filter((f) => f.id === scope.facultyId) : faculty;
  const visibleIds = new Set(visible.map((f) => f.id));

  const rows: FacultyLoadView[] = loadReport(visible, assignments, limits).map((r) => ({
    ...r,
    department: visible.find((f) => f.id === r.facultyId)!.departmentName,
    classes: assignments
      .filter((a) => a.facultyId === r.facultyId)
      .map((a) => ({
        label: `${a.subjectName}, ${a.sectionName}`,
        amount: amountOf(a, limits),
        when: a.meetings.map((m) => `${DAY_LONG[m.dayOfWeek]} ${formatRange(m.startMin, m.endMin)}`).join("; "),
      })),
  }));

  const names = new Map((await prisma.faculty.findMany({ select: { id: true, fullName: true } })).map((f) => [f.id, f.fullName]));
  const fixRows = await prisma.workloadFix.findMany({
    where: scope.isAdmin ? {} : { OR: [{ fromFacultyId: { in: [...visibleIds] } }, { toFacultyId: { in: [...visibleIds] } }] },
    orderBy: { appliedAt: "desc" },
    take: opts.history ?? 30,
  });
  const fixes: FixView[] = fixRows.map((f) => ({
    id: f.id, mode: f.mode, label: f.label, from: names.get(f.fromFacultyId) ?? "Faculty", to: names.get(f.toFacultyId) ?? "Faculty",
    amount: f.amount, measure: f.measure, fromBefore: f.fromBefore, fromAfter: f.fromAfter, toBefore: f.toBefore, toAfter: f.toAfter,
    reason: f.reason, trigger: f.trigger, appliedAt: f.appliedAt.toISOString(), undoneAt: f.undoneAt?.toISOString() ?? null,
    canUndo: !f.undoneAt && scope.role !== "FACULTY" && (scope.isAdmin || (visibleIds.has(f.fromFacultyId) && visibleIds.has(f.toFacultyId))),
  }));

  let proposals: ProposalView[] = [];
  if (scope.role !== "FACULTY") {
    const raw = await prisma.workloadProposal.findMany({
      where: { status: { not: "SUPERSEDED" }, ...(scope.isAdmin ? {} : { departmentId: scope.departmentId }) },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    proposals = raw.map((p) => ({
      id: p.id,
      status: p.status,
      automatic: p.automatic,
      createdAt: p.createdAt.toISOString(),
      explanation: p.explanation,
      narrative: p.narrative,
      canReview: p.status === "PENDING" && (scope.isAdmin || (!!p.departmentId && p.departmentId === scope.departmentId)),
      moves: (p.items as unknown as Move[]).map((m) => ({ ...m, from: names.get(m.fromFacultyId) ?? "Faculty", to: names.get(m.toFacultyId) ?? "Faculty" })),
    }));
  }

  // Flags about people outside the viewer's scope are not shown to a Head of Department.
  const flags = (status?.flags ?? []).filter((f) => scope.isAdmin || !f.facultyId || visibleIds.has(f.facultyId));
  return { limits, rows, status, flags, fixes, proposals };
}
