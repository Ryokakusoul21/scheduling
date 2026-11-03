import { Suspense } from "react";
import Link from "next/link";
import { CalendarDots, ChartBar } from "@phosphor-icons/react/ssr";
import { getScope } from "@/lib/permissions/scope";
import { LEVELS, termLabel } from "@/lib/academics/levels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/components/ux/live-refresh";
import { FacultyDashboard, HeadDashboard } from "@/components/dashboard/role-dashboards";
import { getActiveTerms, manilaNow } from "@/components/dashboard/overview/data";
import { KpiSkeleton, SectionSkeleton } from "@/components/dashboard/overview/kit";
import { AdminAttention, AdminKpis, LatestFixesSection, PendingFixesSection, TodaySection, WorkloadSection } from "@/components/dashboard/overview/sections";

export const metadata = { title: "Dashboard · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ term?: string; department?: string; building?: string; view?: string }> }) {
  const [scope, params, activeTerms] = await Promise.all([getScope(), searchParams, getActiveTerms()]);
  const role = scope.role;
  const now = manilaNow();

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-gradient-to-r from-primary to-primary/60 p-5 text-primary-foreground sm:p-6">
      <div className="space-y-1.5">
        <p className="text-sm font-medium opacity-90">
          {now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting(now.getHours())}, {(scope.name ?? "there").split(" ")[0]}</h1>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {activeTerms.length === 0 ? (
            <Badge variant="secondary">No active term — set one in Academic Years and Terms</Badge>
          ) : (
            activeTerms.map((t) => (
              <Badge key={t.id} variant="secondary" className="text-xs">
                {LEVELS[t.level].short}
                {t.program ? ` ${t.program.code}` : ""} · {termLabel(t.type)}
              </Badge>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {role === "ADMINISTRATOR" && (
          <>
            <LiveRefresh className="text-primary-foreground/80" />
            <Button variant="secondary" className="h-9" nativeButton={false} render={<Link href="/analytics?view=overview" />}>
              <ChartBar className="size-4" /> Data analytics
            </Button>
          </>
        )}
        <Button variant="secondary" className="h-9" nativeButton={false} render={<Link href="/scheduler" />} aria-keyshortcuts="g s">
          <CalendarDots className="size-4" /> Open Scheduler
        </Button>
      </div>
    </div>
  );

  // Each role has its own dashboard; Faculty and Heads of Department only ever receive their own scope.
  if (role === "FACULTY") {
    return (
      <div className="space-y-6">
        {header}
        <FacultyDashboard scope={scope} params={params} />
      </div>
    );
  }
  if (role === "HEAD_OF_DEPARTMENT") {
    return (
      <div className="space-y-6">
        {header}
        <HeadDashboard scope={scope} params={params} />
      </div>
    );
  }

  // Administrator: what to act on first, then workload, then today's picture.
  return (
    <div className="space-y-6">
      {header}

      <Suspense fallback={<KpiSkeleton />}>
        <AdminKpis scope={scope} />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Suspense fallback={<SectionSkeleton />}>
          <AdminAttention scope={scope} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <PendingFixesSection scope={scope} />
        </Suspense>
      </div>

      <Suspense fallback={<SectionSkeleton rows={6} />}>
        <WorkloadSection scope={scope} />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-2">
        <Suspense fallback={<SectionSkeleton rows={5} />}>
          <LatestFixesSection scope={scope} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton rows={5} />}>
          <TodaySection isAdmin={scope.isAdmin} />
        </Suspense>
      </div>
    </div>
  );
}
