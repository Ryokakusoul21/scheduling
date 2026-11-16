"use client";

import { CalendarBlank, CheckCircle, Clock, WarningCircle } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ScheduleInsights } from "@/lib/analytics/schedule-insights";

export function ScheduleInsightPanel({ data, activeDay, activeStatus, onDay, onStatus, onConflicts }: { data: ScheduleInsights; activeDay?: string; activeStatus?: string; onDay?: (day: string) => void; onStatus?: (status: string) => void; onConflicts?: () => void }) {
  const tiles = [
    { label: "Class meetings", value: data.total, hint: `${data.sections} sections · ${data.faculty} faculty · ${data.rooms} rooms`, icon: CalendarBlank },
    { label: "Teaching hours / week", value: data.weeklyHours, hint: "Sum of recurring meeting durations", icon: Clock },
    { label: "Published in selection", value: data.total ? `${data.publicationRate}%` : "—", hint: `${data.published} of ${data.total} meetings published`, icon: CheckCircle },
    { label: "Overlapping meeting pairs", value: data.conflictPairs, hint: `${data.conflictIds.length} meetings to review`, icon: WarningCircle },
  ];
  const max = Math.max(1, ...data.daily.map((day) => day.hours));
  return <section aria-label="Schedule analytics" className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map(({ label, value, hint, icon: Icon }) => <Card key={label} className={cn(label === "Overlapping meeting pairs" && data.conflictPairs > 0 && "ring-amber-500/40")}><CardContent className="space-y-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{label}</p><Icon className="size-4 text-primary" aria-hidden /></div><p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{hint}</p></CardContent></Card>)}
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle>How the teaching week is distributed</CardTitle><p className="text-xs text-muted-foreground">Weekly teaching hours by day{onDay ? "; select a day to filter the report" : ""}.</p></CardHeader><CardContent className="space-y-3">
        {data.daily.map((day) => {
          const bar = <><span className="w-12 shrink-0 text-xs font-medium">{day.label.slice(0, 3)}</span><span className="relative h-6 min-w-0 flex-1 overflow-hidden rounded bg-muted"><span className="absolute inset-y-0 left-0 rounded bg-primary/80" style={{ width: `${day.hours / max * 100}%` }} /></span><span className="w-20 text-right text-xs tabular-nums">{day.hours} h <span className="text-muted-foreground">· {day.count}</span></span></>;
          return onDay ? <button key={day.day} type="button" aria-pressed={activeDay === day.day} onClick={() => onDay(day.day)} title={`${day.label}: ${day.count} meetings, ${day.hours} hours`} className={cn("flex w-full items-center gap-3 rounded-md py-0.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring", activeDay === day.day && "bg-primary/5 ring-1 ring-primary/25")}>{bar}</button> : <div key={day.day} className="flex items-center gap-3" aria-label={`${day.label}: ${day.count} meetings, ${day.hours} hours`}>{bar}</div>;
        })}
        <p className="pt-1 text-xs text-muted-foreground">Hours · number of meetings. Combined terms show the sum of their weekly patterns.</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Publication & review</CardTitle><p className="text-xs text-muted-foreground">Workflow status and recommended follow-up for this selection.</p></CardHeader><CardContent className="space-y-4">
        <div className="space-y-2">{data.statuses.map((status) => {
          const content = <><span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", status.status === "PUBLISHED" ? "bg-emerald-600" : status.status === "REVIEW" ? "bg-amber-500" : "bg-slate-400")} />{status.label}</span><span className="font-semibold tabular-nums">{status.count}</span></>;
          return onStatus ? <button key={status.status} type="button" aria-pressed={activeStatus === status.status} onClick={() => onStatus(status.status)} className={cn("flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", activeStatus === status.status && "ring-1 ring-primary/25")}>{content}</button> : <div key={status.status} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">{content}</div>;
        })}</div>
        <div className="space-y-2 border-t pt-3 text-sm">
          {!data.total ? <p className="text-muted-foreground">No meetings in this selection. Change the filters or add schedules to start measuring.</p> : <>
            {data.conflictPairs > 0 ? <div className="space-y-1"><p className="font-medium text-amber-700 dark:text-amber-300">Review {data.conflictPairs} overlapping meeting pairs.</p><p className="text-xs text-muted-foreground">Shared room: {data.resourceConflicts.room} · faculty: {data.resourceConflicts.faculty} · section: {data.resourceConflicts.section}. A pair can share more than one resource.</p>{onConflicts && <button type="button" onClick={onConflicts} className="text-xs font-medium text-primary underline underline-offset-4">Show meetings to review</button>}</div> : <p className="flex items-start gap-2 text-xs text-muted-foreground"><CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />No recurring meeting overlaps found in this selection.</p>}
            {data.total > data.published && <p className="text-xs text-muted-foreground">{data.total - data.published} meetings are still in draft or review. Complete review before issuing an official timetable.</p>}
            {data.affectedMeetings > 0 && <p className="text-xs text-muted-foreground">Check {data.affectedOccurrences} class occurrences affected by calendar events across {data.affectedMeetings} weekly meetings.</p>}
          </>}
        </div>
        <p className="text-[11px] text-muted-foreground">Overlap checks use recurring times and term dates.</p>
      </CardContent></Card>
    </div>
  </section>;
}
