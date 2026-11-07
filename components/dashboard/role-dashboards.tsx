import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { dashboardAnalytics } from "@/lib/analytics/dashboard";
import { departmentExtras } from "@/lib/analytics/department";
import { defaultTermFor, facultyAnalytics } from "@/lib/analytics/faculty";
import { handledScope, handlesTerm, type Handled } from "@/lib/permissions/handled";
import { EmptyState } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import { DepartmentAnalyticsView } from "./department-analytics";
import { FacultyAnalyticsView } from "./faculty-analytics";
import { SectionSkeleton } from "./overview/kit";
import { PendingFixesSection } from "./overview/sections";

/** Terms to choose from; a Head of Department gets only the ones for the levels and programs they handle. */
async function termOptions(handled: Handled | null = null) {
  const terms = await prisma.semester.findMany({ include: { academicYear: { select: { name: true } } }, orderBy: [{ startDate: "desc" }, { level: "asc" }] });
  // With a single handled level the level name adds nothing, and the active term comes first.
  const single = handled?.levels.length === 1;
  return terms.filter((t) => handlesTerm(handled, t))
    .map((t) => ({ value: t.id, label: `${single ? "" : `${levelLabel(t.level)} · `}${termLabel(t.type)} ${t.academicYear.name}${t.isActive ? " (active)" : ""}`, active: t.isActive }))
    .sort((a, b) => Number(b.active) - Number(a.active));
}

/** The requested term when allowed, else the default one, else the first active term in the options. */
async function resolveTerm(requested: string | undefined, facultyId: string | null, options?: { value: string; active: boolean }[]) {
  const allowed = (id: string | null | undefined) => !!id && (!options || options.some((o) => o.value === id));
  if (allowed(requested) && (await prisma.semester.count({ where: { id: requested } }))) return requested!;
  const fallback = await defaultTermFor(facultyId);
  return allowed(fallback) ? fallback : (options?.find((o) => o.active) ?? options?.[0])?.value ?? null;
}

const NOT_LINKED = (
  <EmptyState title="Account not linked to a faculty record" description="Ask the Registrar to link your account in User Management so your teaching analytics can be shown." />
);

/** Faculty dashboard: only the signed-in faculty member's own data. */
export async function FacultyDashboard({ scope, params }: { scope: Scope; params: { term?: string } }) {
  if (!scope.facultyId) return NOT_LINKED;
  const terms = await termOptions(await handledScope(scope));
  const termId = await resolveTerm(params.term, scope.facultyId, terms);
  if (!termId) return <EmptyState title="No terms yet" description="The Registrar has not created any terms." />;
  const data = await facultyAnalytics({ facultyId: scope.facultyId, userId: scope.userId, termId });
  return <FacultyAnalyticsView data={data} terms={terms} />;
}

/** Head of Department dashboard: department analytics, or their own teaching, switched by a toggle. */
export async function HeadDashboard({ scope, params }: { scope: Scope; params: { term?: string; view?: string } }) {
  const view = params.view === "mine" ? "mine" : "department";
  const terms = await termOptions(await handledScope(scope));
  const termId = await resolveTerm(params.term, scope.facultyId, terms);
  if (!termId) return <EmptyState title="No terms yet" description="No term exists yet for the programs you handle." />;

  const toggle = (
    <div key="view-toggle" className="flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Dashboard view">
      {(["department", "mine"] as const).map((v) => (
        <Link
          key={v}
          role="tab"
          aria-selected={view === v}
          href={`/dashboard?view=${v}&term=${termId}`}
          scroll={false}
          className={cn("rounded-md px-3.5 py-1.5 text-sm font-medium", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
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
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <PendingFixesSection scope={scope} />
        </Suspense>
      }
    />
  );
}
