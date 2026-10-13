import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { dashboardAnalytics } from "@/lib/analytics/dashboard";
import { departmentExtras } from "@/lib/analytics/department";
import { defaultTermFor, facultyAnalytics } from "@/lib/analytics/faculty";
import { workloadView } from "@/lib/workload/view";
import { EmptyState } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import { DepartmentAnalyticsView } from "./department-analytics";
import { FacultyAnalyticsView } from "./faculty-analytics";
import { WorkloadBalance } from "./workload-balance";

async function termOptions() {
  const terms = await prisma.semester.findMany({ include: { academicYear: { select: { name: true } } }, orderBy: [{ startDate: "desc" }, { level: "asc" }] });
  return terms.map((t) => ({ value: t.id, label: `${levelLabel(t.level)} · ${termLabel(t.type)} ${t.academicYear.name}${t.isActive ? " (active)" : ""}` }));
}

async function resolveTerm(requested: string | undefined, facultyId: string | null) {
  if (requested && (await prisma.semester.count({ where: { id: requested } }))) return requested;
  return defaultTermFor(facultyId);
}

const NOT_LINKED = (
  <EmptyState title="Account not linked to a faculty record" description="Ask the Administrator to link your account in User Management so your teaching analytics can be shown." />
);

/** Faculty dashboard: only the signed-in faculty member's own data. */
export async function FacultyDashboard({ scope, params }: { scope: Scope; params: { term?: string } }) {
  if (!scope.facultyId) return NOT_LINKED;
  const termId = await resolveTerm(params.term, scope.facultyId);
  if (!termId) return <EmptyState title="No terms yet" description="The Administrator has not created any terms." />;
  const [data, terms] = await Promise.all([facultyAnalytics({ facultyId: scope.facultyId, userId: scope.userId, termId }), termOptions()]);
  return <FacultyAnalyticsView data={data} terms={terms} />;
}

/** Head of Department dashboard: department analytics, or their own teaching, switched by a toggle. */
export async function HeadDashboard({ scope, params }: { scope: Scope; params: { term?: string; view?: string } }) {
  const view = params.view === "mine" ? "mine" : "department";
  const termId = await resolveTerm(params.term, scope.facultyId);
  if (!termId) return <EmptyState title="No terms yet" description="The Administrator has not created any terms." />;
  const terms = await termOptions();

  const toggle = (
    <div className="flex rounded-md border p-0.5" role="tablist" aria-label="Dashboard view">
      {(["department", "mine"] as const).map((v) => (
        <Link
          key={v}
          role="tab"
          aria-selected={view === v}
          href={`/dashboard?view=${v}&term=${termId}`}
          scroll={false}
          className={cn("rounded px-3 py-1 text-xs font-medium", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          {v === "department" ? "Department" : "My Teaching"}
        </Link>
      ))}
    </div>
  );

  if (view === "mine") {
    if (!scope.facultyId) return NOT_LINKED;
    const data = await facultyAnalytics({ facultyId: scope.facultyId, userId: scope.userId, termId });
    return <FacultyAnalyticsView data={data} terms={terms} toggle={toggle} />;
  }

  if (!scope.departmentId) return NOT_LINKED;
  const [data, extras, workload, department] = await Promise.all([
    // The department filter is always the Head of Department's own; there is no way to pick another.
    dashboardAnalytics({ termId, departmentId: scope.departmentId, buildingId: null }),
    departmentExtras(scope.departmentId),
    workloadView(scope, { history: 6 }),
    prisma.department.findUnique({ where: { id: scope.departmentId }, select: { name: true } }),
  ]);
  return (
    <DepartmentAnalyticsView
      data={data}
      extras={extras}
      department={department?.name ?? "My department"}
      terms={terms}
      toggle={toggle}
      workloadPanel={
        <WorkloadBalance
          title="Department Workload Balance"
          rows={workload.rows}
          measure={workload.limits.measure}
          mode={workload.limits.mode}
          checkedAt={workload.status?.checkedAt ?? null}
          flags={workload.flags}
          fixes={workload.fixes}
          proposals={workload.proposals.filter((p) => p.status === "PENDING")}
        />
      }
    />
  );
}
