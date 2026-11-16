"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarBlank, CheckCircle, Clock, GraduationCap, MapPin, User, ArrowUpRight } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRange } from "@/lib/scheduler/timetable";
import { greeting, longDate, startsIn } from "@/lib/student/format";
import { nowAndNext } from "@/lib/student/schedule";
import { useNow } from "@/lib/student/use-now";
import type { PortalActivity, PortalClass, PortalMove } from "@/lib/student/portal";
import { cn } from "@/lib/utils";
import { MovedList } from "./moves";
import { ClassDetailsDrawer } from "./class-drawer";
import { DashboardActivityCalendar } from "@/components/dashboard/activity-calendar";
import { DashboardOverview } from "@/components/dashboard/landing-kit";
import { StudentEmpty, StudentPanel, STUDENT_LINK } from "./workspace-parts";

export function StudentLanding({ firstName, term, section, classes, activities, moves }: {
  firstName: string; term: string; section: { name: string; stage: string }; classes: PortalClass[]; activities: PortalActivity[]; moves: PortalMove[];
}) {
  const at = useNow();
  const [open, setOpen] = useState<string | null>(null);
  if (!at) return <div className="space-y-6" aria-busy="true" aria-label="Loading your school day"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 rounded-2xl" /><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></div>;
  const { now, today, next, dayOff } = nowAndNext(classes, activities, at, moves);
  const current = today.find((meeting) => meeting.live && !meeting.cancelled);
  const focus = current ?? next?.cls;
  const focusDate = current ? now.date : next?.date;
  const meeting = today.filter((item) => !item.cancelled);
  const remaining = meeting.filter((item) => !item.done).length;
  const subjects = new Set(classes.map((item) => item.subjectCode)).size;
  const hours = Math.round(classes.reduce((sum, item) => sum + item.endMin - item.startMin, 0) / 6) / 10;
  const learningDays = new Set(classes.map((item) => item.dayOfWeek)).size;

  return <div data-dashboard-role="STUDENT" className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-brand-link uppercase">Your day at a glance</p><h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{greeting(now.minutes)}, {firstName}.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{section.name} <span aria-hidden>·</span> {section.stage} <span aria-hidden>·</span> {term}</p></div>
      <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground"><CalendarBlank aria-hidden className="size-4 text-brand-link" />{longDate(now.date)}</p>
    </header>

    <DashboardOverview activities={<DashboardActivityCalendar activities={activities} today={now.date} href="/student/calendar" />} items={[
      { label: "Classes today", value: meeting.length, hint: `${remaining} remaining or in progress`, href: "#student-today" },
      { label: "Enrolled subjects", value: subjects, hint: "Your published subjects this term", href: "/student/subjects" },
      { label: "Weekly class hours", value: hours, hint: `${learningDays} learning days per week`, href: "/student/schedule" },
      { label: "Classes remaining", value: remaining, hint: "Today, including classes in progress", href: "#student-today" },
      { label: "Class changes", value: moves.length, hint: "Moved and online meetings in the next two weeks", href: "/student/schedule" },
      { label: "Upcoming activities", value: activities.filter((activity) => activity.endDate >= now.date).length, hint: "Approved events and school dates", href: "/student/calendar" },
    ]} />

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section aria-label={current ? "Class in progress" : "Your next class"} className="relative min-w-0 overflow-hidden rounded-2xl bg-brand-navy p-6 text-white sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full border-[40px] border-white/[0.035]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-white/75 uppercase"><span className={cn("size-1.5 rounded-full", current ? "bg-emerald-400" : "bg-brand-gold")} />{current ? "Happening now" : "Up next"}</span>{!current && next?.inMinutes != null && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">Starts {startsIn(next.inMinutes)}</span>}</div>
          <p className="mt-5 text-xs font-medium text-brand-gold">{focus?.subjectCode ?? (dayOff ? "A break in your schedule" : "Your campus workspace")}</p>
          <h2 className="mt-2 max-w-xl font-heading text-2xl leading-snug font-semibold sm:text-3xl">{focus?.subjectName ?? (dayOff ? "No classes today" : classes.length ? "You’re all caught up" : "Your timetable is on its way")}</h2>
          {focus && focusDate ? <>
            <p className="mt-3 flex items-center gap-2 text-sm text-white/80"><Clock aria-hidden className="size-4 shrink-0" />{focusDate === now.date ? "Today" : longDate(focusDate)} <span aria-hidden>·</span> {formatRange(focus.startMin, focus.endMin)}</p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/75"><p className="flex items-center gap-2"><MapPin aria-hidden className="size-4 shrink-0 text-brand-gold" />{focus.room ?? "Room to be announced"}{focus.building && ` · ${focus.building}`}</p><p className="flex items-center gap-2"><User aria-hidden className="size-4 shrink-0 text-brand-gold" />{focus.faculty}</p></div>
          </> : <p className="mt-3 max-w-md text-sm leading-6 text-white/75">{dayOff?.title ?? (classes.length ? "There are no upcoming classes in the next seven days. Take a look at your timetable to plan ahead." : "Your classes will appear here once your section’s timetable is published.")}</p>}
          <div className="mt-7 flex flex-wrap items-center gap-5"><Link href="/student/schedule" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-xs font-semibold text-brand-navy outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-brand-gold">Open my timetable <ArrowRight aria-hidden className="size-4" /></Link>{focus && <button type="button" onClick={() => setOpen(focus.subjectCode)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-xs font-medium text-white/85 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-brand-gold">Class details <ArrowUpRight aria-hidden className="size-3.5" /></button>}</div>
        </div>
      </section>
    <div className="min-w-0 space-y-5">
        <StudentPanel id="student-today" title="Today’s classes" description={longDate(now.date)} action={<Link href="/student/schedule" className={STUDENT_LINK}>Full timetable <ArrowRight aria-hidden className="size-3.5" /></Link>}>
          {!today.length || dayOff ? <StudentEmpty title={dayOff ? "No classes today" : "A little breathing room"} icon={dayOff ? CheckCircle : GraduationCap}>{dayOff?.title ?? (classes.length ? "You have no classes scheduled today. Check your timetable for the rest of your week." : "Your section’s published classes will appear here.")}</StudentEmpty> : <ol className="space-y-3" aria-label="Today’s classes">{today.map((item) => <li key={item.id}>
            <button type="button" onClick={() => setOpen(item.subjectCode)} className={cn("flex w-full flex-wrap items-start gap-3 rounded-xl border p-4 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring", item.live && !item.cancelled && "border-brand-blue/40 bg-brand-blue/5", (item.done || item.cancelled) && "text-muted-foreground")}>
              <span className="w-full shrink-0 text-xs font-medium tabular-nums sm:w-32">{formatRange(item.startMin, item.endMin)}</span>
              <span className="min-w-0 flex-1"><span className={cn("block text-sm font-semibold", item.cancelled && "line-through")}>{item.subjectCode}</span><span className="mt-1 block text-xs leading-5">{item.subjectName}</span><span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin aria-hidden className="size-3.5 shrink-0" />{item.room ?? "Room to be announced"}</span></span>
              <Badge variant="secondary" className={cn("text-[10px]", item.live && !item.cancelled && "bg-brand-blue text-white")}>{item.cancelled ? "Cancelled" : item.live ? "In progress" : item.done ? "Completed" : "Upcoming"}</Badge>
            </button>
          </li>)}</ol>}
        </StudentPanel>
        {moves.length > 0 && <StudentPanel title="Changes to your timetable" description="Moved and online meetings in the next two weeks"><MovedList moves={moves} /></StudentPanel>}
    </div>
    </div>
    <ClassDetailsDrawer subjectCode={open} classes={classes} onClose={() => setOpen(null)} />
  </div>;
}
