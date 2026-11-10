import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatRange, DAY_LONG } from "@/lib/scheduler/timetable";
import type { Scope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { loadWorkload } from "./load";
import { amountOf, balanceSummary, loadReport, nearLimit, validateRows, type LoadRow, type Move } from "./optimizer";
import { activeTermIds, getWorkloadStatus } from "./auto";
import { awaitingLabel, canApprove, canEdit, canReject, type ReviewRow } from "./approval";

export interface FacultyLoadView extends LoadRow {
  department: string;
  departmentId: string | null;
  nearLimit: boolean;
  /** Net change waiting in open proposals, in the workload measure (null when none). */
  pendingChange: number | null;
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

export interface ProposalRowView {
  id: string;
  key: string;
  label: string;
  amount: number;
  fromFacultyId: string;
  toFacultyId: string;
  from: string;
  to: string;
  fromBefore: number;
  fromAfter: number;
  toBefore: number;
  toAfter: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";
  edited: boolean;
  awaiting: string | null;
  /** Why an open row can no longer be applied as proposed. */
  problem: string | null;
  canApprove: boolean;
  canReject: boolean;
  /** Valid alternative receivers with their load after the move (only for the giving department's Head). */
  candidates: { id: string; name: string; after: number }[] | null;
}

export interface ProposalView {
  id: string;
  version: number;
  status: string;
  automatic: boolean;
  createdAt: string;
  reviewedAt: string | null;
  explanation: string;
  reviewNote: string | null;
  department: string;
  canReview: boolean;
  rows: ProposalRowView[];
}

/** Current load of everyone a proposal touches, for the before-and-after preview. */
export type PreviewLoads = Record<string, { name: string; load: number; minimum: number; maximum: number }>;

/**
 * Everything the workload screens show for the viewer: loads across the active terms (own load for Faculty,
 * own department for a Head of Department, everyone for the Registrar), the balance summary, the latest
 * check, open proposals and their history, and the fix log.
 */
export async function workloadView(scope: Scope, opts: { history?: number } = {}) {
  const termIds = await activeTermIds();
  const mine = scope.isAdmin ? {} : { OR: [{ departmentId: { in: scope.departmentIds } }, { rows: { some: { toDepartmentId: { in: scope.departmentIds } } } }] };
  const [nameRows, proposalRows, status, departments, data] = await Promise.all([
    prisma.faculty.findMany({ where: departmentWhere.faculty(scope), select: { id: true, fullName: true } }),
    scope.role !== "HEAD_OF_DEPARTMENT"
      ? Promise.resolve([])
      : prisma.workloadProposal.findMany({ where: { kind: "WORKLOAD", ...mine }, include: { rows: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    getWorkloadStatus(),
    prisma.department.findMany({ select: { id: true, name: true } }),
    // Every department loads, so cross-department rows and alternative receivers can be checked.
    loadWorkload(termIds, null),
  ]);
  const { limits, faculty, assignments } = data;
  const department = scope.isAdmin || scope.role === "FACULTY" ? null : scope.manageDepartmentId;
  const visible = scope.role === "FACULTY" ? faculty.filter((f) => f.id === scope.facultyId) : faculty.filter((f) => !department || scope.departmentIds.includes(f.departmentId ?? ""));
  const visibleIds = new Set(visible.map((f) => f.id));
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "the Registrar";
  const facultyName = new Map(faculty.map((f) => [f.id, f.name]));

  const actor = { isAdmin: scope.isAdmin, departmentIds: scope.departmentIds };
  const toView = (p: (typeof proposalRows)[number]): ProposalView => ({
    id: p.id,
    version: p.version,
    status: p.status,
    automatic: p.automatic,
    createdAt: p.createdAt.toISOString(),
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    explanation: p.explanation,
    reviewNote: p.reviewNote,
    department: deptName(p.departmentId),
    canReview: p.status === "PENDING" && p.rows.some((r) => canApprove(actor, r as ReviewRow) || canReject(actor, r as ReviewRow)),
    rows: p.rows.map((r) => {
      const stored = r.move as unknown as Move;
      const open = p.status === "PENDING" && (r.status === "PENDING" || r.status === "APPROVED");
      // Open rows show today's loads; closed rows keep the numbers they were decided on.
      const live = open ? validateRows(data, [{ key: r.key, fromFacultyId: r.fromFacultyId, toFacultyId: r.toFacultyId }]) : null;
      const m = live?.ok ? live.moves[0] : stored;
      const editable = open && canEdit(actor, r as ReviewRow);
      const view = r as ReviewRow;
      return {
        id: r.id, key: r.key, label: stored.label, amount: m.amount, fromFacultyId: r.fromFacultyId, toFacultyId: r.toFacultyId,
        from: facultyName.get(r.fromFacultyId) ?? data.inactiveNames.get(r.fromFacultyId) ?? "A former faculty member",
        to: facultyName.get(r.toFacultyId) ?? "A former faculty member",
        fromBefore: m.fromBefore, fromAfter: m.fromAfter, toBefore: m.toBefore, toAfter: m.toAfter, reason: stored.reason,
        status: r.status, edited: r.edited,
        awaiting: awaitingLabel(view, { from: deptName(r.fromDepartmentId), to: deptName(r.toDepartmentId) }),
        problem: live && !live.ok ? live.problems.join(" ") : null,
        canApprove: open && canApprove(actor, view),
        canReject: open && canReject(actor, view),
        candidates: editable
          ? faculty
              .filter((f) => f.id !== r.fromFacultyId)
              .flatMap((f) => {
                const v = validateRows(data, [{ key: r.key, fromFacultyId: r.fromFacultyId, toFacultyId: f.id }]);
                return v.ok ? [{ id: f.id, name: f.name, after: v.moves[0].toAfter }] : [];
              })
          : null,
      };
    }),
  });
  const proposals = proposalRows.filter((p) => p.status === "PENDING").map(toView);
  const history = proposalRows.filter((p) => p.status !== "PENDING").map(toView);

  const report = loadReport(faculty, assignments, limits);
  const pending = new Map<string, number>();
  for (const r of proposals.flatMap((p) => p.rows).filter((r) => r.status === "PENDING" || r.status === "APPROVED")) {
    pending.set(r.fromFacultyId, (pending.get(r.fromFacultyId) ?? 0) - r.amount);
    pending.set(r.toFacultyId, (pending.get(r.toFacultyId) ?? 0) + r.amount);
  }
  const rows: FacultyLoadView[] = report.filter((r) => visibleIds.has(r.facultyId)).map((r) => {
    const f = faculty.find((x) => x.id === r.facultyId)!;
    return {
      ...r,
      department: f.departmentName,
      departmentId: f.departmentId,
      nearLimit: nearLimit(r),
      pendingChange: pending.has(r.facultyId) ? Math.round(pending.get(r.facultyId)! * 10) / 10 : null,
      classes: assignments
        .filter((a) => a.facultyId === r.facultyId)
        .map((a) => ({
          label: `${a.subjectName}, ${a.sectionName}`,
          amount: amountOf(a, limits),
          when: a.meetings.length ? a.meetings.map((m) => `${DAY_LONG[m.dayOfWeek]} ${formatRange(m.startMin, m.endMin)}`).join("; ") : "Assigned, not yet scheduled",
        })),
    };
  });
  const summary = balanceSummary(rows, limits.tolerance);
  const preview: PreviewLoads = Object.fromEntries(
    report.filter((r) => proposals.some((p) => p.rows.some((x) => x.fromFacultyId === r.facultyId || x.toFacultyId === r.facultyId)))
      .map((r) => [r.facultyId, { name: r.name, load: r.load, minimum: r.minimum, maximum: r.maximum }]),
  );

  // Faculty of other departments are not named to a Head of Department in the fix log.
  const names = new Map(nameRows.map((f) => [f.id, f.fullName]));
  const OTHER = "A faculty member of another department";
  const fixRows = scope.isAdmin ? [] : await prisma.workloadFix.findMany({
    where: scope.isAdmin ? {} : { OR: [{ fromFacultyId: { in: [...visibleIds] } }, { toFacultyId: { in: [...visibleIds] } }] },
    orderBy: { appliedAt: "desc" },
    take: opts.history ?? 30,
  });
  const fixes: FixView[] = fixRows.map((f) => ({
    id: f.id, mode: f.mode, label: f.label, from: names.get(f.fromFacultyId) ?? OTHER, to: names.get(f.toFacultyId) ?? OTHER,
    amount: f.amount, measure: f.measure, fromBefore: f.fromBefore, fromAfter: f.fromAfter, toBefore: f.toBefore, toAfter: f.toAfter,
    reason: f.reason, trigger: f.trigger, appliedAt: f.appliedAt.toISOString(), undoneAt: f.undoneAt?.toISOString() ?? null,
    canUndo: !f.undoneAt && scope.role !== "FACULTY" && (scope.isAdmin || (visibleIds.has(f.fromFacultyId) && visibleIds.has(f.toFacultyId))),
  }));

  // Flags about people outside the viewer's scope are not shown to a Head of Department.
  const flags = (status?.flags ?? []).filter((f) => scope.isAdmin || !f.facultyId || visibleIds.has(f.facultyId));
  return { limits, rows, summary, status: scope.isAdmin ? null : status, flags: scope.isAdmin ? [] : flags, fixes, proposals, history: scope.role === "FACULTY" ? [] : history, preview };
}
