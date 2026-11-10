import Link from "next/link";
import { Buildings, CheckCircle, Clock, ShieldCheck, Users } from "@phosphor-icons/react/ssr";
import { administratorLanding, registrarLanding } from "@/lib/dashboard/landing";
import type { Scope } from "@/lib/permissions/scope";
import { roleLabel } from "@/lib/permissions/roles";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { SUBMISSION_LABEL, submissionTitle } from "@/lib/scheduler/submissions";
import { isPeriodOpenNow } from "@/lib/scheduler/period-rules";
import { Badge } from "@/components/ui/badge";
import { Section, QuietState } from "./overview/kit";
import { RecentActivity } from "./overview/recent-activity";
import { UrgentMovesSection } from "./overview/sections";
import { DepartmentStaffingSection } from "./department-staffing";
import { LandingMetrics, dashboardLink } from "./landing-kit";

const timestamp = (date: Date) => date.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export async function AdministratorDashboard({ scope }: { scope: Scope }) {
  const data = await administratorLanding(scope);
  const attention = data.staffing.filter((row) => row.recommendationLevel !== "NONE");
  const faculty = data.staffing.reduce((sum, row) => sum + row.activeFaculty, 0);
  const rank = { URGENT: 0, HIGH: 1, REASSIGN: 2, REBALANCE: 3, MONITOR: 4, NONE: 5 };
  const departments = [...data.staffing].sort((a, b) => rank[a.recommendationLevel] - rank[b.recommendationLevel]);
  return <div className="space-y-5">
    <LandingMetrics items={[
      { label: "Departments", value: data.staffing.length, hint: "Institution-wide academic structure", href: "/admin/departments" },
      { label: "Staffing attention", value: attention.length, hint: "Capacity, allocation, or workload indicators", href: "#department-health", attention: attention.length > 0 },
      { label: "Active faculty", value: faculty, hint: "Across departments with staffing records", href: "/faculty" },
      { label: "Accounts to review", value: data.pendingAccounts, hint: "Verified registrations awaiting activation", href: "/admin/users", attention: data.pendingAccounts > 0 },
      { label: "Unassigned classes", value: data.staffing.reduce((sum, row) => sum + row.unassignedClasses, 0), hint: "Teaching assignments still needed", href: "/workload" },
      { label: "Capacity gaps", value: data.staffing.filter((row) => row.additionalCapacityNeeded > 0).length, hint: "Departments with a teaching capacity gap", href: "#department-health" },
    ]} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section id="department-health" title="Department health" count={attention.length} href="/admin/departments" linkLabel="Manage departments">
        <p className="text-sm text-muted-foreground">Departments needing a staffing review appear first.</p>
        {!departments.length ? <QuietState icon={Buildings} title="No departments yet">Create a department to start monitoring capacity.</QuietState> : <ul className="divide-y">
          {departments.slice(0, 5).map((department) => <li key={department.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-xs font-bold text-primary">{department.code}</span>
            <div className="min-w-0 flex-1"><p className="font-medium">{department.name}</p><p className="mt-1 text-xs text-muted-foreground">{department.activeFaculty} active faculty · {department.unassignedClasses} unassigned classes{department.additionalCapacityNeeded > 0 ? ` · ${department.additionalCapacityNeeded} ${department.measure === "HOURS" ? "hours" : "units"} capacity gap` : ""}</p></div>
            <Badge variant={department.recommendationLevel === "URGENT" || department.recommendationLevel === "HIGH" ? "destructive" : "secondary"}>{department.recommendationLevel === "NONE" ? "No shortage indicated" : department.recommendationLevel === "REASSIGN" ? "Review allocation" : department.recommendationLevel === "REBALANCE" ? "Rebalance load" : department.recommendationLevel === "MONITOR" ? "Near capacity" : "Capacity gap"}</Badge>
            <Link href={`/analytics?department=${encodeURIComponent(department.id)}`} className="text-sm font-medium text-primary hover:underline">View<span className="sr-only"> {department.name} analytics</span></Link>
          </li>)}
        </ul>}
        <p className="text-xs text-muted-foreground">Capacity gaps are teaching hours or units, not a hiring headcount. Review qualifications and availability before staffing decisions.</p>
        <details className="rounded-lg border"><summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Full staffing assessment</summary><div className="min-w-0 border-t p-2"><DepartmentStaffingSection departments={data.staffing} /></div></details>
      </Section>
      <div className="space-y-5">
        <Section id="account-attention" title="Account requests" count={data.pendingAccounts} href="/admin/users" linkLabel="Review accounts">
          {!data.accounts.length ? <QuietState icon={CheckCircle} title="No accounts waiting">Verified registrations will appear here.</QuietState> : <ul className="divide-y">{data.accounts.map((account) => <li key={account.id} className="flex items-center gap-3 py-3 first:pt-0"><Users className="size-4 shrink-0 text-muted-foreground" aria-hidden /><div className="min-w-0 flex-1"><p className="font-medium">{account.name}</p><p className="text-xs text-muted-foreground">{roleLabel(account.role)} · {timestamp(account.createdAt)}</p></div><Link href="/admin/users" className={dashboardLink}>Review</Link></li>)}</ul>}
        </Section>
        <Section id="administration-links" title="Administration">
          <div className="grid gap-2 sm:grid-cols-2"><Link className={dashboardLink} href="/admin/audit-logs">Audit logs</Link><Link className={dashboardLink} href="/admin/settings">System settings</Link><Link className={dashboardLink} href="/scheduler">View school schedules</Link><Link className={dashboardLink} href="/admin/review-center">View submissions</Link></div>
          <p className="text-xs text-muted-foreground">The Registrar reviews and publishes timetables.</p>
        </Section>
      </div>
    </div>
    <Section id="administrative-activity" title="Administrative activity" href="/admin/audit-logs" linkLabel="Open audit logs"><RecentActivity entries={data.activity} limit={6} /></Section>
  </div>;
}

export async function RegistrarDashboard({ scope }: { scope: Scope }) {
  const data = await registrarLanding(scope);
  return <div className="space-y-5">
    <LandingMetrics items={[
      { label: "Class timetables", value: data.awaitingReview + data.awaitingPublication - data.examinationSubmissions, hint: "Awaiting review or publication", href: "/admin/review-center?queue=class-schedules" },
      { label: "Awaiting review", value: data.awaitingReview, hint: "Submitted class and examination timetables", href: "#review-queue", attention: data.awaitingReview > 0 },
      { label: "Ready to publish", value: data.awaitingPublication, hint: "Approved packages awaiting publication", href: "#review-queue" },
      { label: "Examination packages", value: data.examinationSubmissions, hint: "Awaiting review or publication", href: "/admin/review-center?queue=examinations" },
      { label: "Open submission periods", value: data.openPeriods, hint: "Currently accepting department submissions", href: "/admin/scheduling-periods" },
      { label: "Upcoming periods", value: data.periods.filter((period) => period.startsAt > new Date()).length, hint: "Submission windows opening soon", href: "/admin/scheduling-periods" },
    ]} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section id="review-queue" title="Your review queue" count={data.awaitingReview + data.awaitingPublication} href="/admin/review-center" linkLabel="Open Review Center">
        <p className="text-sm text-muted-foreground">Oldest submissions first. Open a timetable to review its classes, notes, and checks.</p>
        {!data.submissions.length ? <QuietState icon={CheckCircle} title="Your queue is clear">New department submissions will appear here.</QuietState> : <ul className="space-y-3">{data.submissions.map((submission) => <li key={submission.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="max-w-prose font-semibold">{submissionTitle(submission)}</h3><Badge variant={submission.status === "APPROVED" ? "secondary" : "outline"}>{SUBMISSION_LABEL[submission.status]}</Badge></div>
          <p className="mt-2 text-xs text-muted-foreground">{levelLabel(submission.semester.level)} · {termLabel(submission.semester.type)} · {submission.semester.academicYear.name}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{submission.submittedBy.name ?? "Department head"} · {timestamp(submission.submittedAt)} · {submission.classCount} {submission.kind === "CLASS" ? "classes" : "examinations"}</p><Link href={`/admin/review-center/timetables/${submission.id}`} className={dashboardLink}><ShieldCheck className="size-4" aria-hidden />{submission.status === "APPROVED" ? "View publication" : "Review timetable"}</Link></div>
        </li>)}</ul>}
      </Section>
      <Section id="submission-periods" title="Submission deadlines" href="/admin/scheduling-periods" linkLabel="Manage periods">
        {!data.periods.length ? <QuietState icon={Clock} title="No open or upcoming periods">Open a submission period when departments can send their timetables.</QuietState> : <ul className="divide-y">{data.periods.slice(0, 5).map((period) => <li key={period.id} className="space-y-2 py-3 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{period.name}</p><Badge variant={isPeriodOpenNow(period) ? "secondary" : "outline"}>{isPeriodOpenNow(period) ? "Open" : "Upcoming"}</Badge></div><p className="text-xs text-muted-foreground">{levelLabel(period.semester.level)} · {period.semester.academicYear.name}</p><p className="text-xs">{isPeriodOpenNow(period) ? "Closes" : "Opens"} {timestamp(isPeriodOpenNow(period) ? period.endsAt : period.startsAt)}</p></li>)}</ul>}
      </Section>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <UrgentMovesSection />
      <Section id="academic-workspace" title="Academic workspace"><div className="grid gap-2 sm:grid-cols-2"><Link className={dashboardLink} href="/scheduler">Open timetables</Link><Link className={dashboardLink} href="/academic-years">Academic years and terms</Link><Link className={dashboardLink} href="/calendar">School calendar</Link><Link className={dashboardLink} href="/reports">Schedule reports</Link></div></Section>
    </div>
  </div>;
}
