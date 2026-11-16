"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarBlank, CaretLeft, CaretRight, Clock, MapPin } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calendarDays, monthLabel, shiftMonth } from "@/lib/student/calendar";
import { ACTIVITY_TYPES, activitiesOn, formatDateRange, longDate } from "@/lib/student/format";
import { formatRange } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";

export interface DashboardActivity {
  id: string;
  type: string;
  title: string;
  startDate: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
  location?: string;
}

const ACTIVITY_COLORS: Record<string, { dot: string; badge: string }> = {
  SCHOOL_EVENT: { dot: "bg-blue-500", badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  HOLIDAY: { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  EXAMINATION_WEEK: { dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  CLASS_SUSPENSION: { dot: "bg-rose-500", badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};

export function DashboardActivityCalendar({ activities, today, href = "/calendar" }: {
  activities: DashboardActivity[];
  today: string;
  href?: string;
}) {
  const titleId = useId();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const nextMonth = `${shiftMonth(month, 1)}-01`;
  const agenda = (selected
    ? activitiesOn(activities, selected)
    : activities.filter((activity) => activity.startDate < nextMonth && activity.endDate >= (month === today.slice(0, 7) ? today : `${month}-01`)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startMin ?? 0) - (b.startMin ?? 0) || a.title.localeCompare(b.title));
  const agendaTitle = selected ? longDate(selected) : month === today.slice(0, 7) ? "Upcoming this month" : "Activities this month";

  function navigate(amount: number) {
    setMonth(shiftMonth(month, amount));
    setSelected(null);
  }

  return <section aria-labelledby={titleId} className="@container flex h-full min-w-0 w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><CalendarBlank className="size-5" weight="duotone" aria-hidden /></span>
        <div><h2 id={titleId} className="text-base font-semibold tracking-tight">Campus activities</h2><p className="mt-0.5 text-xs text-muted-foreground">School events and dates to plan around</p></div>
      </div>
      <Link href={href} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Full calendar<ArrowRight className="size-3.5" aria-hidden /></Link>
    </header>
    <div className="grid flex-1 @lg:grid-cols-[264px_minmax(0,1fr)]">
      <div className="border-b bg-muted/25 p-4 @lg:border-r @lg:border-b-0">
        <div className="mx-auto max-w-80">
          <div className="mb-3 flex items-center justify-between gap-1">
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Previous month" onClick={() => navigate(-1)}><CaretLeft className="size-4" aria-hidden /></Button>
            <p className="text-base font-semibold" aria-live="polite">{monthLabel(month)}</p>
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Next month" onClick={() => navigate(1)}><CaretRight className="size-4" aria-hidden /></Button>
          </div>
          <div className="grid grid-cols-7 gap-x-0.5 gap-y-1 text-center">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day} className="pb-2 text-xs font-medium text-muted-foreground">{day}</span>)}
            {calendarDays(month).map((date) => {
              const dayActivities = activitiesOn(activities, date);
              const count = dayActivities.length;
              const types = [...new Set(dayActivities.map((activity) => activity.type))].slice(0, 3);
              return <button key={date} type="button" onClick={() => { setSelected(date); setMonth(date.slice(0, 7)); }}
                aria-label={`${longDate(date)}, ${count} ${count === 1 ? "activity" : "activities"}`}
                aria-current={date === today ? "date" : undefined} aria-pressed={selected === date}
                className={cn("relative flex h-10 min-w-0 flex-col items-center justify-center rounded-lg text-sm font-medium tabular-nums outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring", !date.startsWith(month) && "text-muted-foreground/50", date === today && "font-bold text-primary ring-1 ring-primary/40 ring-inset", selected === date && "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90")}>
                {Number(date.slice(-2))}
                {count > 0 && <span aria-hidden className="absolute bottom-1 flex gap-0.5">{types.map((type) => <span key={type} className={cn("size-1 rounded-full", selected === date ? "bg-primary-foreground" : (ACTIVITY_COLORS[type] ?? ACTIVITY_COLORS.SCHOOL_EVENT).dot)} />)}</span>}
              </button>;
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span>Select a date to see activities</span>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Today</Button>
          </div>
        </div>
      </div>
      <div className="min-w-0 p-5" aria-live="polite">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2"><h3 className="text-base font-semibold">{agendaTitle}</h3><Badge variant="secondary" className="shrink-0 text-xs">{agenda.length}</Badge></div>
          {selected && <Button type="button" variant="ghost" size="sm" className="text-xs text-primary" onClick={() => setSelected(null)}>View month</Button>}
        </div>
        {agenda.length ? <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">{agenda.slice(0, 5).map((activity) => {
          const date = new Date(`${activity.startDate}T00:00:00Z`);
          const colors = ACTIVITY_COLORS[activity.type] ?? ACTIVITY_COLORS.SCHOOL_EVENT;
          const ongoing = activity.startDate <= today && today <= activity.endDate;
          return <li key={activity.id} className="flex items-start gap-3 rounded-xl border bg-background p-3">
            <div aria-hidden className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-muted/65 py-2"><span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span><span className="mt-0.5 text-2xl leading-none font-semibold tabular-nums">{date.getUTCDate()}</span></div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5"><span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium", colors.badge)}><span aria-hidden className={cn("size-1.5 rounded-full", colors.dot)} />{ACTIVITY_TYPES[activity.type] ?? "Activity"}</span>{ongoing && <span className="text-xs font-medium text-muted-foreground">{activity.startDate === activity.endDate ? "Today" : "Ongoing"}</span>}</div>
              <p className="text-base leading-6 font-semibold break-words">{activity.title}</p>
              <p className="text-xs leading-5 text-muted-foreground">{formatDateRange(activity.startDate, activity.endDate)}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="size-3 shrink-0" aria-hidden />{activity.startMin !== null && activity.endMin !== null ? formatRange(activity.startMin, activity.endMin) : "All day"}</span>
                {activity.location && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3 shrink-0" aria-hidden /><span className="break-words">{activity.location}</span></span>}
              </div>
            </div>
          </li>;
        })}</ul> : <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/15 px-5 text-center"><span className="flex size-11 items-center justify-center rounded-full bg-muted"><CalendarBlank className="size-5 text-muted-foreground" aria-hidden /></span><div><p className="text-sm font-medium">{selected ? "No activities on this date" : month === today.slice(0, 7) ? "No upcoming activities this month" : "No activities this month"}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">Choose another date to explore the campus calendar.</p></div></div>}
        {agenda.length > 5 && <Link href={href} className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">View all {agenda.length} activities<ArrowRight className="size-3.5" aria-hidden /></Link>}
      </div>
    </div>
  </section>;
}
