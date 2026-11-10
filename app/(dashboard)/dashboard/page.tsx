import { Suspense } from "react";
import { getScope } from "@/lib/permissions/scope";
import { isAcademicLevel } from "@/lib/academics/levels";
import { handledScope, handlesTerm } from "@/lib/permissions/handled";
import { FacultyDashboard, HeadDashboard } from "@/components/dashboard/role-dashboards";
import { AdministratorDashboard, RegistrarDashboard } from "@/components/dashboard/office-dashboards";
import { getActiveTerms } from "@/components/dashboard/overview/data";
import { KpiSkeleton, SectionSkeleton } from "@/components/dashboard/overview/kit";
import { LiveRefresh } from "@/components/ux/live-refresh";
import { DashboardBanner, dashboardTheme } from "@/components/dashboard/reference-banner";

export const metadata = { title: "Dashboard · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

const LANDING = {
  SUPER_ADMINISTRATOR: { title: "Administrator overview", description: "School health, staffing priorities, and account administration.", action: "Review department health", href: "#department-health" },
  REGISTRAR: { title: "Registrar workspace", description: "Review department submissions, manage deadlines, and publish official timetables.", action: "Open Review Center", href: "/admin/review-center" },
  HEAD_OF_DEPARTMENT: { title: "Department workspace", description: "Prepare your timetables, follow submissions, and manage department workload.", action: "Open timetables", href: "/scheduler" },
  FACULTY: { title: "My teaching day", description: "Your classes, schedule updates, and requests in one place.", action: "View my schedule", href: "/scheduler" },
} as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ term?: string; department?: string; building?: string; view?: string }> }) {
  const [scope, params, allActiveTerms] = await Promise.all([getScope(), searchParams, getActiveTerms()]);
  // The separate student portal owns student landing pages.
  if (scope.role === "STUDENT") return null;
  const handled = await handledScope(scope);
  const activeTerms = allActiveTerms.filter((term) => isAcademicLevel(term.level) && handlesTerm(handled, term));
  const role = scope.role;
  const landing = LANDING[role];
  const date = new Date();

  return <div data-dashboard-role={role} style={dashboardTheme(role)} className="mx-auto max-w-[1600px] space-y-5 pb-2">
    <DashboardBanner role={role} name={scope.name} date={date} context={`${landing.title} · ${activeTerms.length} active ${activeTerms.length === 1 ? "term" : "terms"}`} action={landing.action} href={landing.href} status={scope.isAdmin ? <LiveRefresh className="text-white/70" /> : undefined} />
    <Suspense fallback={<div className="space-y-5"><KpiSkeleton /><SectionSkeleton rows={5} /></div>}>
      {role === "SUPER_ADMINISTRATOR" ? <AdministratorDashboard scope={scope} /> : role === "REGISTRAR" ? <RegistrarDashboard scope={scope} /> : role === "HEAD_OF_DEPARTMENT" ? <HeadDashboard scope={scope} params={params} /> : <FacultyDashboard scope={scope} params={params} />}
    </Suspense>
  </div>;
}
