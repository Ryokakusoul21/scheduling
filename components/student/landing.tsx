"use client";

import { Broadcast, CalendarBlank, CheckCircle, Clock, MapPin } from "@phosphor-icons/react/ssr";
import { ClassFocus, LandingMetrics } from "@/components/dashboard/landing-kit";
import { Section, QuietState } from "@/components/dashboard/overview/kit";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRange } from "@/lib/scheduler/timetable";
import { formatDateRange, longDate } from "@/lib/student/format";
import { nowAndNext } from "@/lib/student/schedule";
import { useNow } from "@/lib/student/use-now";
import type { PortalActivity, PortalClass, PortalMove } from "@/lib/student/portal";
import { DashboardBanner, dashboardTheme } from "@/components/dashboard/reference-banner";
import { NoticeBanner } from "./notice-banner";
import { MovedList } from "./moves";

export function StudentLanding({ firstName, term, section, classes, activities, moves }: {
  firstName: string; term: string; section: { name: string; stage: string }; classes: PortalClass[]; activities: PortalActivity[]; moves: PortalMove[];
}) {
  const at = useNow();
  if (!at) return <div className="space-y-5" aria-busy="true" aria-label="Loading your school day"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 rounded-2xl" /><div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div></div>;
  const { now, today, next, dayOff } = nowAndNext(classes, activities, at, moves);
  const current = today.find((meeting) => meeting.live && !meeting.cancelled);
  const focus = current ?? next?.cls;
  const focusDate = current ? now.date : next?.date;
  const upcoming = activities.filter((activity) => activity.endDate >= now.date).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const meeting = today.filter((item) => !item.cancelled);
  const subjects = new Set(classes.map((item) => item.subjectCode));
  const hours = Math.round(classes.reduce((sum, item) => sum + item.endMin - item.startMin, 0) / 6) / 10;

  return <div data-dashboard-role="STUDENT" style={dashboardTheme("STUDENT")} className="space-y-5">
    <DashboardBanner role="STUDENT" name={firstName} date={at} context={`${section.name} · ${section.stage} · ${term}`} action="My timetable" href="/student/schedule" />
    <LandingMetrics items={[
      { label: "Classes today", value: meeting.length, hint: dayOff ? "Classes suspended or on holiday" : `${meeting.filter((item) => !item.done).length} remaining or in progress`, href: "#student-today" },
      { label: "My subjects", value: subjects.size, hint: "Subjects on your published timetable", href: "/student/subjects" },
      { label: "Weekly class hours", value: hours, hint: "Based on your regular published schedule", href: "/student/schedule" },
      { label: "Class changes", value: moves.length, hint: "Moved or online meetings in the next two weeks", href: "#student-changes", attention: moves.length > 0 },
      { label: "Upcoming activities", value: upcoming.length, hint: "School activities in your term", href: "/student/calendar" },
      { label: "Classes remaining", value: meeting.filter((item) => !item.done).length, hint: "Today, including classes in progress", href: "#student-today" },
    ]} />
    <NoticeBanner activities={activities} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ClassFocus eyebrow={current ? "Class in progress" : "Your next class"} title={focus?.subjectCode ?? (dayOff ? "No classes today" : "No upcoming classes")} description={focus?.subjectName ?? dayOff?.title ?? "Your next published meeting will appear here."} when={focus && focusDate ? `${focusDate === now.date ? "Today" : longDate(focusDate)} · ${formatRange(focus.startMin, focus.endMin)}` : undefined} location={focus ? `${focus.room ?? "Room to be announced"}${focus.building ? ` · ${focus.building}` : ""}` : undefined} detail={focus?.faculty} href="/student/schedule" />
      <Section id="student-activities" title="Coming up" href="/student/calendar" linkLabel="School calendar">
        {!upcoming.length ? <QuietState icon={CalendarBlank} title="No upcoming activities" /> : <ul className="divide-y">{upcoming.slice(0, 3).map((activity) => <li key={activity.id} className="py-3 first:pt-0"><p className="font-medium">{activity.title}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateRange(activity.startDate, activity.endDate)}</p>{activity.type === "EXAMINATION_WEEK" && <Badge variant="outline" className="mt-2">Examination week</Badge>}</li>)}</ul>}
      </Section>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section id="student-today" title="Today's classes" href="/student/schedule" linkLabel="Full timetable">
        {!today.length || dayOff ? <QuietState icon={Clock} title={dayOff ? `No classes today: ${dayOff.title}` : "No classes today"}>{!classes.length ? "Your section's timetable has not been published yet." : "Check your next class above or open your weekly timetable."}</QuietState> : <ol className="space-y-2">{today.map((item) => <li key={item.id} className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 ${item.live && !item.cancelled ? "border-primary/40 bg-primary/5" : item.done || item.cancelled ? "text-muted-foreground" : ""}`}>
          <p className="w-36 shrink-0 text-sm font-medium tabular-nums">{formatRange(item.startMin, item.endMin)}</p><div className="min-w-0 flex-1"><p className={`font-medium ${item.cancelled ? "line-through" : ""}`}>{item.subjectCode} · {item.subjectName}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0" aria-hidden />{item.room ?? "Room to be announced"}</p><p className="mt-1 text-xs text-muted-foreground">{item.faculty}</p></div><Badge variant={item.live && !item.cancelled ? "default" : "secondary"}>{item.cancelled ? "Cancelled" : item.live ? <><Broadcast className="size-3" aria-hidden />In progress</> : item.done ? "Finished" : "Upcoming"}</Badge>
        </li>)}</ol>}
      </Section>
      <Section id="student-changes" title="Changes to your classes">
        {!moves.length ? <QuietState icon={CheckCircle} title="No class changes">Your published timetable is up to date.</QuietState> : <><MovedList moves={moves.slice(0, 3)} />{moves.length > 3 && <details><summary className="cursor-pointer rounded py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Show {moves.length - 3} more changes</summary><MovedList moves={moves.slice(3)} /></details>}</>}
      </Section>
    </div>
  </div>;
}
