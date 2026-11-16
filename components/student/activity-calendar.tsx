"use client";

import { useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight, Clock, ListBullets, MagnifyingGlass, ArrowRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/ux/native-select";
import { ACTIVITY_TYPES, activitiesOn, formatDateRange, longDate, manilaNow } from "@/lib/student/format";
import { calendarDays, monthActivities, monthLabel, shiftMonth } from "@/lib/student/calendar";
import { formatRange } from "@/lib/scheduler/timetable";
import { useNow } from "@/lib/student/use-now";
import type { PortalActivity } from "@/lib/student/portal";
import { cn } from "@/lib/utils";
import { ActivityTypeBadge } from "./activity-badge";
import { StudentEmpty, StudentPanel } from "./workspace-parts";

const DOTS: Record<string, string> = { HOLIDAY: "bg-emerald-600", CLASS_SUSPENSION: "bg-red-600", EXAMINATION_WEEK: "bg-amber-600", SCHOOL_EVENT: "bg-blue-600" };

export function StudentActivityCalendar({ activities }: { activities: PortalActivity[] }) {
  const at = useNow();
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  if (!at) return <Skeleton aria-label="Loading your activities calendar" className="h-[550px] rounded-2xl" />;
  const today = manilaNow(at).date;
  const month = pickedMonth ?? today.slice(0, 7);
  const selected = pickedDate ?? today;
  const days = calendarDays(month);
  const shown = monthActivities(activities, month, type, query);
  const selectedActivities = activitiesOn(shown, selected);
  const next = activities.filter((activity) => activity.endDate >= today && (!type || activity.type === type)
    && (!query.trim() || `${activity.title} ${activity.description}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  function goToMonth(amount: number) {
    const target = shiftMonth(month, amount);
    setPickedMonth(target);
    setPickedDate(`${target}-01`);
  }

  return <div className="space-y-5">
    <div className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1"><Button type="button" variant="outline" size="icon" className="size-10" aria-label="Previous month" onClick={() => goToMonth(-1)}><CaretLeft aria-hidden className="size-4" /></Button><Button type="button" variant="outline" size="icon" className="size-10" aria-label="Next month" onClick={() => goToMonth(1)}><CaretRight aria-hidden className="size-4" /></Button></div>
          <h2 aria-live="polite" className="min-w-36 font-heading text-lg font-semibold">{monthLabel(month)}</h2>
          <Button type="button" variant="outline" className="min-h-10" onClick={() => { setPickedMonth(null); setPickedDate(null); }}>Today</Button>
        </div>
        <div role="group" aria-label="Calendar view" className="flex rounded-xl bg-muted/70 p-1">{[{ value: "month", label: "Calendar", icon: CalendarBlank }, { value: "agenda", label: "Agenda", icon: ListBullets }].map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value as typeof view)} className={cn("flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", view === value ? "bg-card text-brand-link shadow-xs" : "text-muted-foreground hover:text-foreground")}><Icon aria-hidden className="size-4" />{label}</button>)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <label className="relative min-w-0 basis-48 flex-1"><span className="sr-only">Search activities</span><MagnifyingGlass aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an activity…" className="h-11 rounded-lg pl-9" /></label>
        <NativeSelect aria-label="Activity type" placeholder="All activity types" value={type} onChange={(event) => setType(event.target.value)} options={Object.entries(ACTIVITY_TYPES).map(([value, label]) => ({ value, label }))} className="min-w-0 basis-44 [&_select]:h-11" />
        {(type || query) && <Button type="button" variant="ghost" onClick={() => { setType(""); setQuery(""); }}>Clear filters</Button>}
      </div>
    </div>

    {view === "month" ? <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-label={`${monthLabel(month)} calendar`} className="min-w-0 overflow-hidden rounded-2xl border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/30">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="py-3 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{day}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((date) => {
            const rows = activitiesOn(shown, date);
            const inMonth = date.startsWith(month);
            const isToday = date === today;
            return <button type="button" key={date} aria-label={`${longDate(date)}, ${rows.length} activit${rows.length === 1 ? "y" : "ies"}${isToday ? ", today" : ""}`} aria-pressed={date === selected}
              onClick={() => { setPickedDate(date); if (!inMonth) setPickedMonth(date.slice(0, 7)); }}
              className={cn("flex min-h-14 min-w-0 flex-col items-start gap-1 border-r border-b border-border/50 p-1.5 text-left outline-none transition-colors nth-[7n]:border-r-0 hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-28 sm:p-2", !inMonth && "bg-muted/20 text-muted-foreground", date === selected && "bg-brand-blue/5 ring-2 ring-brand-blue/60 ring-inset")}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs", isToday ? "bg-brand-blue font-semibold text-white" : "font-medium")}>{Number(date.slice(-2))}</span>
              <span className="flex max-w-full flex-wrap gap-0.5 sm:hidden" aria-hidden>{rows.slice(0, 3).map((activity) => <span key={activity.id} className={cn("size-1 rounded-full", DOTS[activity.type] ?? "bg-blue-600")} />)}</span>
              <span className="hidden w-full min-w-0 space-y-1 sm:block" aria-hidden>{rows.slice(0, 2).map((activity) => <span key={activity.id} className="flex min-w-0 items-center gap-1 rounded bg-muted/70 px-1 py-0.5 text-[10px]"><span className={cn("size-1 shrink-0 rounded-full", DOTS[activity.type] ?? "bg-blue-600")} /><span className="truncate">{activity.title}</span></span>)}{rows.length > 2 && <span className="block text-[10px] text-muted-foreground">+{rows.length - 2} more</span>}</span>
            </button>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] leading-5 text-muted-foreground"><span>{shown.length} activit{shown.length === 1 ? "y" : "ies"} this month</span><span>Select a date to explore activities</span></div>
      </section>
      <StudentPanel title="Day agenda" description={longDate(selected)}>
        {selectedActivities.length ? <div className="space-y-3">{selectedActivities.map((activity) => <ActivityCard key={activity.id} activity={activity} expanded />)}</div> : <StudentEmpty title="No activities on this day">{type || query ? "Try clearing your filters or selecting another date." : "A clear day on your campus calendar."}</StudentEmpty>}
        {next && <button type="button" onClick={() => { const date = next.startDate < today ? today : next.startDate; setPickedMonth(date.slice(0, 7)); setPickedDate(date); }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border text-xs font-semibold text-brand-link outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Jump to next activity <ArrowRight aria-hidden className="size-3.5" /></button>}
      </StudentPanel>
    </div> : <StudentPanel title={`${monthLabel(month)} agenda`} description={`${shown.length} approved activit${shown.length === 1 ? "y" : "ies"} for your term`}>
      {!shown.length ? <StudentEmpty title="No activities found">Try another month or clear your filters.</StudentEmpty> : <div className="grid items-start gap-4 lg:grid-cols-2">{shown.map((activity) => <ActivityCard key={activity.id} activity={activity} />)}</div>}
    </StudentPanel>}
    <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground"><CalendarBlank aria-hidden className="mt-1 size-4 shrink-0" />Showing approved school activities for your academic term. All activity times use Philippine time.</p>
  </div>;
}

function ActivityCard({ activity, expanded = false }: { activity: PortalActivity; expanded?: boolean }) {
  return <details open={expanded || undefined} className="group min-w-0 rounded-xl border bg-card">
    <summary className="cursor-pointer list-none space-y-2 rounded-xl p-4 outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <ActivityTypeBadge type={activity.type} /><h3 className="text-sm leading-6 font-semibold">{activity.title}</h3><p className="text-[11px] leading-5 text-muted-foreground">{formatDateRange(activity.startDate, activity.endDate)}</p>
      <p className="text-[10px] font-medium text-brand-link group-open:hidden">View activity details</p>
    </summary>
    <div className="space-y-3 border-t px-4 py-3">
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><Clock aria-hidden className="size-3.5 shrink-0" />{activity.startMin == null ? "All day" : formatRange(activity.startMin, activity.endMin ?? 1440)}</p>
      <p className="text-xs leading-6 break-words whitespace-pre-line text-muted-foreground">{activity.description || "No additional details provided."}</p>
    </div>
  </details>;
}
