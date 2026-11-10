import Link from "next/link";
import { ArrowRight, CheckCircle, Clock, MapPin } from "@phosphor-icons/react/ssr";
import { facultyLanding, headLanding } from "@/lib/dashboard/landing";
import type { Scope } from "@/lib/permissions/scope";
import { formatRange } from "@/lib/scheduler/timetable";
import { SUBMISSION_LABEL } from "@/lib/scheduler/submissions";
import { isPeriodOpenNow } from "@/lib/scheduler/period-rules";
import { longDate } from "@/lib/student/format";
import { Badge } from "@/components/ui/badge";
import { Section, QuietState } from "./overview/kit";
import { PendingFixesSection } from "./overview/sections";
import { ClassFocus, LandingMetrics, dashboardLink } from "./landing-kit";

const stamp = (date: Date) => date.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export async function FacultyLanding({ scope }: { scope: Scope }) {
  const data = await facultyLanding(scope);
  const focus = data.current ?? data.next;
  return <div className="space-y-5">
    <LandingMetrics items={[
      { label: "Classes today", value: data.today.length, hint: `${data.remaining} remaining or in progress`, href: "#teaching-today" },
      { label: "Planned teaching load", value: data.load.value, hint: `${data.load.unit} · maximum ${data.load.maximum}`, href: "/workload", attention: data.load.value > data.load.maximum },
      { label: "My pending requests", value: data.requests, hint: "Schedule requests awaiting a decision", href: "/requests" },
      { label: "My pending bookings", value: data.bookings, hint: "Room bookings awaiting approval", href: "/bookings" },
      { label: "Classes remaining", value: data.remaining, hint: "Today, including classes in progress", href: "#teaching-today" },
      { label: "Next 7 days", value: data.weekCount, hint: "Upcoming published class meetings", href: "/scheduler" },
    ]} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ClassFocus eyebrow={data.current ? "Teaching now" : "Your next class"} title={focus?.title ?? "No upcoming classes"} description={focus ? focus.changed ? "This meeting reflects a schedule change." : "Your published teaching schedule" : "No published meetings in the next seven days."} when={focus ? `${focus.date === data.date ? "Today" : longDate(focus.date)} · ${formatRange(focus.startMin, focus.endMin)}` : undefined} location={focus?.room} href="/scheduler" />
      <Section id="teaching-actions" title="Manage your teaching day"><div className="grid gap-2"><Link href="/availability" className={dashboardLink}>Report unavailability</Link><Link href="/requests" className={dashboardLink}>Track schedule requests</Link><Link href="/bookings" className={dashboardLink}>Book a room</Link></div><p className="text-xs text-muted-foreground">Requests go to the responsible department for a decision.</p></Section>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section id="teaching-today" title="Today's classes" href="/scheduler" linkLabel="Full timetable">
        {!data.today.length ? <QuietState icon={Clock} title="No classes today">Your next published meeting appears above.</QuietState> : <ol className="space-y-2">{data.today.map((session) => <li key={session.id} className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 ${session.id === data.current?.id ? "border-primary/40 bg-primary/5" : session.endMin <= data.minutes ? "text-muted-foreground" : ""}`}>
          <div className="w-36 shrink-0 text-sm font-medium tabular-nums">{formatRange(session.startMin, session.endMin)}</div><div className="min-w-0 flex-1"><p className="font-medium">{session.title}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5" aria-hidden />{session.room}</p></div><Badge variant={session.id === data.current?.id ? "default" : "secondary"}>{session.id === data.current?.id ? "In progress" : session.endMin <= data.minutes ? "Finished" : session.changed ? "Updated" : "Upcoming"}</Badge>
        </li>)}</ol>}
      </Section>
      <Section id="teaching-updates" title="Your latest updates" href="/notifications" linkLabel="All notifications">
        {!data.notifications.length ? <QuietState icon={CheckCircle} title="No updates yet" /> : <ul className="divide-y">{data.notifications.map((notification) => <li key={notification.id} className="space-y-1 py-3 first:pt-0"><div className="flex items-start gap-2">{!notification.isRead && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}<p className="font-medium">{notification.title}</p></div><p className="text-xs text-muted-foreground">{notification.message}</p><p className="text-xs text-muted-foreground">{stamp(notification.createdAt)}</p></li>)}</ul>}
      </Section>
    </div>
  </div>;
}

export async function HeadLanding({ scope, termId, controls }: { scope: Scope; termId: string; controls?: React.ReactNode }) {
  const data = await headLanding(scope, termId);
  const scheduled = data.sections.filter((section) => section.scheduled > 0).length;
  const missing = data.sections.reduce((sum, section) => sum + section.missing, 0);
  const period = data.periods.find((row) => row.kind === "CLASS_TIMETABLE");
  const open = period ? isPeriodOpenNow(period) : false;
  const upcoming = period?.status === "OPEN" && period.startsAt > new Date();
  const windowDescription = !period ? "The Registrar has not opened a submission period for this term."
    : period.status !== "OPEN" ? "Contact the Registrar about the next submission period."
    : `${open ? "Closes" : upcoming ? "Opens" : "Last deadline"} ${stamp(upcoming ? period.startsAt : period.endsAt)}`;
  const scheduler = `/scheduler?termId=${encodeURIComponent(termId)}`;
  const pending = data.submissions.some((row) => row.kind === "CLASS" && (row.status === "SUBMITTED" || row.status === "APPROVED"));
  const sections = [...data.sections].sort((a, b) => Number(b.scheduled === 0) - Number(a.scheduled === 0) || b.missing - a.missing);
  return <div className="space-y-5">
    <LandingMetrics items={[
      { label: "Sections with classes", value: `${scheduled}/${data.sections.length}`, hint: "Sections with at least one scheduled class", href: "#section-readiness" },
      { label: "Unscheduled components", value: missing, hint: "Planned subject components still unplaced", href: scheduler, attention: missing > 0 },
      { label: "Draft class meetings", value: data.drafts, hint: "Continue preparing your timetable", href: scheduler },
      { label: "Department requests", value: data.requests, hint: "Pending requests within your departments", href: "/requests" },
      { label: "Published timetables", value: data.submissions.filter((row) => row.status === "PUBLISHED").length, hint: "Latest published timetable packages", href: scheduler },
      { label: "Revisions needed", value: data.submissions.filter((row) => row.status === "RETURNED" || row.status === "REJECTED").length, hint: "Timetables needing department attention", href: scheduler },
    ]} />
    {controls}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
      <div className="space-y-1"><p className="text-sm font-semibold">{open ? "Class timetable submissions are open" : upcoming ? "Class timetable submissions open soon" : "Class timetable submissions are closed"}</p><p className="text-sm text-muted-foreground">{windowDescription}</p></div>
      <Link href={scheduler} className={`${dashboardLink} bg-primary text-primary-foreground hover:bg-primary/90`}>{pending ? "View submission" : "Continue timetable"}<ArrowRight className="size-4" aria-hidden /></Link>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section id="section-readiness" title="Section scheduling progress" href={scheduler} linkLabel="Open timetable">
        <p className="text-xs text-muted-foreground">Unstarted sections and unplaced components appear first. Final workload and conflict checks run in the Scheduler before submission.</p>
        {!sections.length ? <QuietState icon={Clock} title="No sections in this term"><Link href="/sections" className="text-primary hover:underline">Manage department sections</Link></QuietState> : <ul className="divide-y">{sections.slice(0, 6).map((section) => <li key={section.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0"><div className="min-w-0 flex-1"><p className="font-medium">{section.name}</p><p className="mt-1 text-xs text-muted-foreground">{section.scheduled} scheduled subject components{section.planned ? ` of ${section.planned} planned` : " · curriculum not placed yet"}</p></div><Badge variant={section.missing || !section.scheduled ? "outline" : "secondary"}>{!section.scheduled ? "Not started" : section.missing ? `${section.missing} unplaced` : "Components placed"}</Badge><Link href={`${scheduler}&sectionId=${encodeURIComponent(section.id)}`} className="text-sm font-medium text-primary hover:underline">Open<span className="sr-only"> {section.name}</span></Link></li>)}</ul>}
      </Section>
      <Section id="submission-progress" title="Submission status" href={scheduler} linkLabel="View timetables">
        {!data.submissions.length ? <QuietState icon={Clock} title="No submissions yet">Complete your timetable, run its checks, and submit during an open period.</QuietState> : <ul className="space-y-3">{data.submissions.map((submission) => <li key={submission.id} className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{submission.kind === "CLASS" ? "Class timetable" : `${submission.examType?.toLowerCase().replaceAll("_", " ") ?? ""} examinations`} · v{submission.version}</p><Badge variant={submission.status === "RETURNED" || submission.status === "REJECTED" ? "destructive" : "secondary"}>{SUBMISSION_LABEL[submission.status]}</Badge></div><p className="text-xs text-muted-foreground">{submission.department.name} · {stamp(submission.decidedAt ?? submission.submittedAt)}</p>{submission.reason && <p className="text-sm">{submission.reason}</p>}</li>)}</ul>}
        <p className="text-xs text-muted-foreground">The Registrar reviews and publishes submitted timetables.</p>
      </Section>
    </div>
    <PendingFixesSection scope={scope} />
    <Section id="department-shortcuts" title="Department workspace"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Link href="/subjects" className={dashboardLink}>Subjects and assignments</Link><Link href="/sections" className={dashboardLink}>Sections</Link><Link href="/workload" className={dashboardLink}>Faculty workload</Link><Link href={`/analytics?term=${encodeURIComponent(termId)}`} className={dashboardLink}>Department analytics</Link></div></Section>
  </div>;
}
