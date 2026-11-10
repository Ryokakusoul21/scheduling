import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { defaultTermFor, facultyAnalytics } from "@/lib/analytics/faculty";
import { handledScope, handlesTerm, type Handled } from "@/lib/permissions/handled";
import { EmptyState } from "@/components/ux/states";
import { cn } from "@/lib/utils";
import { FacultyAnalyticsView } from "./faculty-analytics";
import { FacultyLanding, HeadLanding } from "./teaching-landing";
import { dashboardLink } from "./landing-kit";

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
  <EmptyState title="Account not linked to a faculty record" description="Ask the Administrator to link your account to its faculty record so your teaching day can be shown." />
);

/** The daily teaching view is the landing page; detailed analytics remain available on request. */
export async function FacultyDashboard({ scope, params }: { scope: Scope; params: { term?: string; view?: string } }) {
  if (!scope.facultyId) return NOT_LINKED;
  if (params.view !== "analytics") return <div className="space-y-4"><FacultyLanding scope={scope} /><Link href="/dashboard?view=analytics" className={dashboardLink}>View detailed teaching analytics</Link></div>;
  const terms = await termOptions(await handledScope(scope));
  const termId = await resolveTerm(params.term, scope.facultyId, terms);
  if (!termId) return <EmptyState title="No terms yet" description="The Registrar has not created any terms." />;
  const data = await facultyAnalytics({ facultyId: scope.facultyId, userId: scope.userId, termId });
  return <div className="space-y-4"><Link href="/dashboard" className={dashboardLink}>Back to my teaching day</Link><FacultyAnalyticsView data={data} terms={terms} /></div>;
}

/** Department planning and personal teaching have distinct, persistent destinations. */
export async function HeadDashboard({ scope, params }: { scope: Scope; params: { term?: string; view?: string } }) {
  const view = params.view === "mine" ? "mine" : "department";
  const terms = await termOptions(await handledScope(scope));
  const termId = await resolveTerm(params.term, scope.facultyId, terms);
  if (!termId && view === "department") return <EmptyState title="No terms yet" description="No term exists yet for the programs you handle." />;
  const controls = (
<div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="inline-flex rounded-lg border bg-card p-1" aria-label="Dashboard view">
        {(["department", "mine"] as const).map((value) => <Link key={value} href={`/dashboard?view=${value}${termId ? `&term=${encodeURIComponent(termId)}` : ""}`} aria-current={view === value ? "page" : undefined} className={cn("min-h-10 rounded-md px-4 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", view === value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{value === "department" ? "Department" : "My Teaching"}</Link>)}
      </nav>
      {view === "department" && <form action="/dashboard" className="flex max-w-full flex-wrap items-center gap-2"><input type="hidden" name="view" value="department" /><label htmlFor="dashboard-term" className="text-xs font-medium">Term</label><select id="dashboard-term" name="term" defaultValue={termId ?? ""} className="h-10 min-w-0 max-w-full rounded-lg border bg-card px-3 text-sm sm:max-w-md">{terms.map((term) => <option key={term.value} value={term.value}>{term.label}</option>)}</select><button className={dashboardLink} type="submit">Apply</button></form>}
    </div>
  );
  return <div className="space-y-5">{view === "mine" ? <>{controls}{scope.facultyId ? <FacultyLanding scope={scope} /> : NOT_LINKED}</> : <HeadLanding scope={scope} termId={termId!} controls={controls} />}</div>;
}
