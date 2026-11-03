import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { dashboardAnalytics } from "@/lib/analytics/dashboard";
import { departmentExtras } from "@/lib/analytics/department";
import { defaultTermFor, facultyAnalytics } from "@/lib/analytics/faculty";
import { EmptyState } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import { DepartmentAnalyticsView } from "./department-analytics";
import { FacultyAnalyticsView } from "./faculty-analytics";
import { SectionSkeleton } from "./overview/kit";
import { LatestFixesSection, PendingFixesSection, WorkloadSection } from "./overview/sections";

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
  const [termId, terms] = await Promise.all([resolveTerm(params.term, scope.facultyId), termOptions()]);
  if (!termId) return <EmptyState title="No terms yet" description="The Administrator has not created any terms." />;

  const toggle = (
    <div key="view-toggle" className="flex rounded-md border p-0.5" role="tablist" aria-label="Dashboard view">
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
  const [data, extras, department] = await Promise.all([
    // The department filter is always the Head of Department's own; there is no way to pick another.
    dashboardAnalytics({ termId, departmentId: scope.departmentId, buildingId: null }),
    departmentExtras(scope.departmentId),
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
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Suspense fallback={<SectionSkeleton rows={2} />}>
              <PendingFixesSection scope={scope} />
            </Suspense>
            <Suspense fallback={<SectionSkeleton rows={5} />}>
              <LatestFixesSection scope={scope} />
            </Suspense>
          </div>
          <Suspense fallback={<SectionSkeleton rows={6} />}>
            <WorkloadSection scope={scope} title="Department workload" />
          </Suspense>
        </div>
      }
    />
  );
}
