"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CaretLeft, CaretRight, CircleNotch, Plus } from "@phosphor-icons/react/ssr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ux/native-select";
import { ActionButton } from "@/components/ux/action-button";
import { eachDate } from "@/lib/occupancy/engine";
import {
  EVENT_COLORS,
  EVENT_DOTS,
  EVENT_LABELS,
  EVENT_TYPES,
  collapseLanes,
  formatLongDate,
  shiftDate,
  type CalendarView,
  type EventType,
} from "@/lib/calendar";
import { DEFAULT_GRID, formatRange, formatTime, timeOptions } from "@/lib/scheduler/timetable";
import { ACADEMIC_LEVELS, levelLabel } from "@/lib/academics/levels";
import type { ActivityListItem } from "@/lib/activities/status";
import { cn } from "@/lib/utils";
import { deleteActivityAction, saveActivityAction, type ActivityInput } from "./actions";

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  date: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
  detail: string;
  badge?: string;
  href?: string;
  /** Not yet approved; shown only to the Administrator and the submitting department. */
  pending?: boolean;
  activity?: ActivityListItem;
}

/** Choices for the activity form. */
export interface ActivityFormOptions {
  departments: { value: string; label: string }[];
  rooms: { value: string; label: string }[];
  ownDepartmentId: string | null;
}

/** Whether the person may edit or remove this activity: Administrator any, Head of Department their department's events. */
export function canManageActivity(a: Pick<ActivityListItem, "type" | "departmentId">, isAdmin: boolean, ownDepartmentId: string | null) {
  if (a.type === "CLASS_SUSPENSION") return false;
  return isAdmin || (a.type === "SCHOOL_EVENT" && !!ownDepartmentId && a.departmentId === ownDepartmentId);
}

/** Form values for editing an existing activity. */
export function activityForm(a: ActivityListItem): ActivityForm {
  return {
    type: a.type, title: a.title, description: a.description, startDate: a.startDate, endDate: a.endDate,
    startMin: a.startMin?.toString() ?? "", endMin: a.endMin?.toString() ?? "",
    departmentId: a.departmentId ?? "", level: a.level ?? "", roomId: a.roomId ?? "", location: a.locationText, participants: a.participants,
  };
}

const DAY_START = 7 * 60;
const DAY_END = 21 * 60;
const HOUR_PX = 48;
const TIMES = timeOptions({ ...DEFAULT_GRID, dayEnd: DAY_END }).map((t) => ({ value: String(t.value), label: t.label }));
const SCOPE_LABELS: Record<string, string> = { all: "All classes", department: "My department's classes", mine: "My classes only" };
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const PENDING_STYLE = "border-2 border-dashed italic opacity-70";

const isAllDay = (e: CalendarEvent) => e.startMin === null || e.endMin === null;
const onDate = (e: CalendarEvent, d: string) => e.date <= d && e.endDate >= d;

export function CalendarBoard(props: {
  view: CalendarView;
  date: string;
  today: string;
  from: string;
  to: string;
  events: CalendarEvent[];
  classScope: string;
  scopeOptions: string[];
  canEditEvents: boolean;
  isAdmin: boolean;
  ownDepartmentId: string | null;
  formOptions: ActivityFormOptions;
}) {
  const { view, date, today, from, to, events, classScope, scopeOptions } = props;
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<EventType>>(new Set());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [group, setGroup] = useState<CalendarEvent[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; form: ActivityForm } | null>(null);

  const go = (next: Partial<{ view: CalendarView; date: string; scope: string }>) => {
    const p = new URLSearchParams({ view, date, scope: classScope, ...next });
    router.push(`/calendar?${p}`);
  };
  const visible = useMemo(() => events.filter((e) => !hidden.has(e.type)), [events, hidden]);
  const toggle = (t: EventType) => setHidden((h) => { const n = new Set(h); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const title =
    view === "month" ? formatLongDate(date, { month: "long", year: "numeric" })
    : view === "week" ? `${formatLongDate(from, { month: "short", day: "numeric" })} to ${formatLongDate(to, { month: "short", day: "numeric", year: "numeric" })}`
    : formatLongDate(date);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" aria-label="Previous" onClick={() => go({ date: shiftDate(view, date, -1) })}><CaretLeft className="size-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => go({ date: today })}>Today</Button>
            <Button size="icon-sm" variant="outline" aria-label="Next" onClick={() => go({ date: shiftDate(view, date, 1) })}><CaretRight className="size-4" /></Button>
            <h2 className="ml-2 text-base font-semibold">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scopeOptions.length > 1 && (
              <NativeSelect aria-label="Classes shown" value={classScope} onChange={(e) => go({ scope: e.target.value })} options={scopeOptions.map((o) => ({ value: o, label: SCOPE_LABELS[o] }))} className="w-52" />
            )}
            <div className="flex rounded-md border p-0.5" role="tablist" aria-label="Calendar view">
              {(["month", "week", "day"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => go({ view: v })} className={cn("rounded px-2.5 py-1 text-xs font-medium capitalize", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {v}
                </button>
              ))}
            </div>
            {props.canEditEvents && (
              <Button size="sm" onClick={() => setEditing({ form: { ...BLANK, startDate: date, endDate: date } })}>
                <Plus className="size-4" /> {props.isAdmin ? "Add activity" : "Submit activity"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" aria-label="Show or hide activity types">
          {EVENT_TYPES.map((t) => (
            <button key={t} onClick={() => toggle(t)} aria-pressed={!hidden.has(t)} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", hidden.has(t) && "opacity-40")}>
              <span className={cn("size-2 rounded-full", EVENT_DOTS[t])} /> {EVENT_LABELS[t]}
            </button>
          ))}
        </div>
        {events.some((e) => e.pending) && (
          <p className="text-xs text-muted-foreground">
            <span className="mr-1 inline-block rounded border border-dashed border-amber-500 px-1.5 italic">Pending</span>
            Dashed, faded items await approval and are visible only to the Administrator and the submitting department.
          </p>
        )}

        {view === "month" ? (
          <MonthGrid from={from} to={to} month={date.slice(0, 7)} today={today} events={visible} onDay={(d) => go({ view: "day", date: d })} onSelect={setSelected} />
        ) : (
          <TimeGrid dates={view === "week" ? eachDate(from, to) : [date]} today={today} events={visible} onSelect={setSelected} onDay={(d) => go({ view: "day", date: d })} onMore={setGroup} />
        )}
      </CardContent>

      <Dialog open={!!group} onOpenChange={(o) => !o && setGroup(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{group?.length} items at this time</DialogTitle>
            <DialogDescription>Choose one to see its details.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {group?.map((e) => (
              <li key={e.id}>
                <Chip e={e} onSelect={(x) => { setGroup(null); setSelected(x); }} className="py-1.5 text-xs" />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <EventDialog
        event={selected}
        onClose={() => setSelected(null)}
        canEdit={(e) => !!e.activity && canManageActivity(e.activity, props.isAdmin, props.ownDepartmentId)}
        onEdit={(e) => {
          setSelected(null);
          setEditing({ id: e.activity!.id, form: activityForm(e.activity!) });
        }}
        onDeleted={() => { setSelected(null); router.refresh(); }}
      />
      <ActivityDialog state={editing} isAdmin={props.isAdmin} options={props.formOptions} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </Card>
  );
}

function Chip({ e, onSelect, className }: { e: CalendarEvent; onSelect: (e: CalendarEvent) => void; className?: string }) {
  return (
    <button onClick={() => onSelect(e)} className={cn("block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight", EVENT_COLORS[e.type], e.badge && "border-dashed", e.pending && PENDING_STYLE, className)} title={e.title}>
      {!isAllDay(e) && <span className="mr-1 font-medium">{formatTime(e.startMin!)}</span>}
      {e.title}
    </button>
  );
}

function MonthGrid({ from, to, month, today, events, onDay, onSelect }: { from: string; to: string; month: string; today: string; events: CalendarEvent[]; onDay: (d: string) => void; onSelect: (e: CalendarEvent) => void }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-lg border">
        {WEEKDAY_NAMES.map((d) => <div key={d} className="border-b bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">{d}</div>)}
        {eachDate(from, to).map((d) => {
          const day = events.filter((e) => onDate(e, d));
          const classes = day.filter((e) => e.type === "CLASS");
          const others = day.filter((e) => e.type !== "CLASS").sort((a, b) => Number(isAllDay(b)) - Number(isAllDay(a)) || (a.startMin ?? 0) - (b.startMin ?? 0));
          return (
            <div key={d} className={cn("min-h-28 space-y-0.5 border-r border-b p-1", d.slice(0, 7) !== month && "bg-muted/30 text-muted-foreground")}>
              <button onClick={() => onDay(d)} className={cn("mb-0.5 flex size-6 items-center justify-center rounded-full text-xs font-medium hover:bg-muted", d === today && "bg-primary text-primary-foreground")} aria-label={`Open ${formatLongDate(d)}`}>
                {Number(d.slice(8))}
              </button>
              {others.slice(0, 3).map((e) => <Chip key={e.id} e={e} onSelect={onSelect} />)}
              {others.length > 3 && <button onClick={() => onDay(d)} className="text-[11px] text-muted-foreground hover:underline">{others.length - 3} more</button>}
              {classes.length > 0 && (
                <button onClick={() => onDay(d)} className={cn("block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px]", EVENT_COLORS.CLASS)}>
                  {classes.length} class{classes.length === 1 ? "" : "es"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ dates, today, events, onSelect, onDay, onMore }: { dates: string[]; today: string; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void; onDay: (d: string) => void; onMore: (events: CalendarEvent[]) => void }) {
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);
  const height = ((DAY_END - DAY_START) / 60) * HOUR_PX;
  const y = (min: number) => ((Math.min(Math.max(min, DAY_START), DAY_END) - DAY_START) / 60) * HOUR_PX;
  const single = dates.length === 1;
  // At most this many items side by side; the rest fold into a "+N more" block.
  const maxLanes = single ? 6 : 3;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className={cn("grid", single ? "min-w-[360px]" : "min-w-[900px]")} style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(0, 1fr))` }}>
        <div className="border-b bg-muted/50" />
        {dates.map((d) => (
          <button key={d} onClick={() => onDay(d)} className={cn("border-b border-l bg-muted/50 px-2 py-1 text-left text-xs font-medium", d === today && "text-primary")}>
            {formatLongDate(d, { weekday: "short", month: "short", day: "numeric" })}
          </button>
        ))}
        <div className="border-b px-1 py-1 text-[10px] text-muted-foreground">All day</div>
        {dates.map((d) => (
          <div key={d} className="min-h-8 space-y-0.5 border-b border-l p-1">
            {events.filter((e) => onDate(e, d) && isAllDay(e)).map((e) => <Chip key={e.id} e={e} onSelect={onSelect} />)}
          </div>
        ))}
        <div className="relative" style={{ height }}>
          {hours.map((h) => <span key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: y(h) }}>{formatTime(h)}</span>)}
        </div>
        {dates.map((d) => {
          const timed = events.filter((e) => onDate(e, d) && !isAllDay(e));
          const { shown, overflow } = collapseLanes(timed.map((e) => ({ id: e.id, startMin: e.startMin!, endMin: e.endMin! })), maxLanes);
          return (
            <div key={d} className={cn("relative border-l", d === today && "bg-primary/[0.03]")} style={{ height }}>
              {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-dashed border-border/60" style={{ top: y(h) }} />)}
              {timed.map((e) => {
                const l = shown.get(e.id);
                if (!l) return null;
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect(e)}
                    className={cn("absolute overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] leading-tight shadow-xs", EVENT_COLORS[e.type], e.badge && "border-dashed", e.pending && PENDING_STYLE)}
                    style={{ top: y(e.startMin!), height: Math.max(y(e.endMin!) - y(e.startMin!), 18), left: `${(l.lane / l.lanes) * 100}%`, width: `${100 / l.lanes}%` }}
                    title={`${e.title}\n${formatRange(e.startMin!, e.endMin!)}`}
                  >
                    <span className="block truncate font-medium">{e.title}</span>
                    {single && <span className="block truncate opacity-80">{formatRange(e.startMin!, e.endMin!)} · {e.detail.split("\n")[1] ?? ""}</span>}
                    {e.badge && <span className="block truncate font-semibold">{e.badge}</span>}
                  </button>
                );
              })}
              {overflow.map((o) => (
                <button
                  key={o.ids.join()}
                  onClick={() => (single ? onMore(timed.filter((e) => o.ids.includes(e.id))) : onDay(d))}
                  className="absolute flex items-start justify-center overflow-hidden rounded border border-border bg-muted px-1 py-0.5 text-[11px] font-semibold text-foreground shadow-xs hover:bg-accent"
                  style={{ top: y(o.startMin), height: Math.max(y(o.endMin) - y(o.startMin), 18), left: `${(o.lane / o.lanes) * 100}%`, width: `${100 / o.lanes}%` }}
                  title={single ? "Show every item at this time" : "Open this day to see every item"}
                >
                  +{o.ids.length} more
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventDialog({ event, onClose, canEdit, onEdit, onDeleted }: { event: CalendarEvent | null; onClose: () => void; canEdit: (e: CalendarEvent) => boolean; onEdit: (e: CalendarEvent) => void; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();
  if (!event) return null;
  const when = event.date === event.endDate ? formatLongDate(event.date) : `${formatLongDate(event.date)} to ${formatLongDate(event.endDate)}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", EVENT_DOTS[event.type])} />{event.title}</DialogTitle>
          <DialogDescription>{when}{!isAllDay(event) && ` · ${formatRange(event.startMin!, event.endMin!)}`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex gap-1.5"><Badge variant="secondary">{EVENT_LABELS[event.type]}</Badge>{event.badge && <Badge variant="outline">{event.badge}</Badge>}</div>
          {event.detail && <p className="whitespace-pre-line text-muted-foreground">{event.detail}</p>}
        </div>
        <DialogFooter>
          {event.href && <Button variant="outline" nativeButton={false} render={<Link href={event.href} />}>Open {event.type === "CLASS_SUSPENSION" ? "Schedule Adjustments" : EVENT_LABELS[event.type]}</Button>}
          {canEdit(event) && (
            <>
              <ActionButton
                kind="delete"
                size="default"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteActivityAction(event.activity!.id);
                    if (!res.ok) return void toast.error(res.error);
                    toast.success("Activity deleted.");
                    onDeleted();
                  })
                }
              />
              <ActionButton kind="edit" size="default" onClick={() => onEdit(event)} />
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ActivityForm {
  type: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startMin: string;
  endMin: string;
  departmentId: string;
  level: string;
  roomId: string;
  location: string;
  participants: string;
}
const BLANK: ActivityForm = {
  type: "SCHOOL_EVENT", title: "", description: "", startDate: "", endDate: "", startMin: "", endMin: "",
  departmentId: "", level: "", roomId: "", location: "", participants: "",
};
const LEVEL_OPTIONS = ACADEMIC_LEVELS.map((l) => ({ value: l, label: levelLabel(l) }));

/** Add or edit form; a Head of Department's save is a submission that waits for the Administrator's approval. */
export function ActivityDialog({ state, isAdmin, options, onClose, onSaved }: { state: { id?: string; form: ActivityForm } | null; isAdmin: boolean; options: ActivityFormOptions; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ActivityForm | null>(null);
  const [key, setKey] = useState<object | null>(null);
  // Reset the form whenever a different activity is opened.
  if (state !== key) {
    setKey(state);
    setForm(state?.form ?? null);
  }
  if (!state || !form) return null;
  const set = (k: keyof ActivityForm) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));
  const holiday = form.type === "HOLIDAY";
  const ownDepartment = options.departments.find((d) => d.value === options.ownDepartmentId)?.label ?? "Your department";

  function save() {
    const f = form!;
    const input: ActivityInput = {
      type: f.type as ActivityInput["type"], title: f.title, description: f.description, startDate: f.startDate, endDate: f.endDate,
      startMin: holiday || !f.startMin ? null : Number(f.startMin), endMin: holiday || !f.endMin ? null : Number(f.endMin),
      departmentId: f.departmentId || null, level: (f.level || null) as ActivityInput["level"], roomId: f.roomId || null,
      location: f.location, participants: f.participants,
    };
    startTransition(async () => {
      const res = await saveActivityAction(input, state!.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(isAdmin ? "Activity saved." : "Activity submitted for approval.");
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{state.id ? "Edit activity" : isAdmin ? "Add activity" : "Submit activity"}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Class suspensions are created in Schedule Adjustments so affected classes are cancelled and offered make-up options."
              : "Submitted and edited activities reach the official calendar after the Administrator approves them."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="a-type">Type</FieldLabel>
            <NativeSelect id="a-type" value={form.type} onChange={set("type")} options={[{ value: "SCHOOL_EVENT", label: "School event" }, ...(isAdmin ? [{ value: "HOLIDAY", label: "Holiday (no classes)" }] : [])]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="a-title">Title</FieldLabel>
            <Input id="a-title" value={form.title} onChange={set("title")} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="a-start">Start date</FieldLabel>
            <Input id="a-start" type="date" value={form.startDate} onChange={set("startDate")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="a-end">End date</FieldLabel>
            <Input id="a-end" type="date" value={form.endDate} onChange={set("endDate")} />
          </Field>
          {!holiday && (
            <>
              <Field>
                <FieldLabel htmlFor="a-from">From (blank for all day)</FieldLabel>
                <NativeSelect id="a-from" value={form.startMin} onChange={set("startMin")} options={TIMES} placeholder="All day" />
              </Field>
              <Field>
                <FieldLabel htmlFor="a-to">To</FieldLabel>
                <NativeSelect id="a-to" value={form.endMin} onChange={set("endMin")} options={TIMES} placeholder="All day" />
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor="a-dept">Department</FieldLabel>
            {isAdmin ? (
              <NativeSelect id="a-dept" value={form.departmentId} onChange={set("departmentId")} options={options.departments} placeholder="All departments" />
            ) : (
              <Input id="a-dept" value={ownDepartment} disabled />
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="a-level">School level</FieldLabel>
            <NativeSelect id="a-level" value={form.level} onChange={set("level")} options={LEVEL_OPTIONS} placeholder="All levels" />
          </Field>
          {!holiday && (
            <>
              <Field>
                <FieldLabel htmlFor="a-room">Room (optional)</FieldLabel>
                <NativeSelect id="a-room" value={form.roomId} onChange={set("roomId")} options={options.rooms} placeholder="No room" />
              </Field>
              <Field>
                <FieldLabel htmlFor="a-loc">Location</FieldLabel>
                <Input id="a-loc" value={form.location} onChange={set("location")} placeholder="For example: Gymnasium" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="a-who">Participants</FieldLabel>
                <Input id="a-who" value={form.participants} onChange={set("participants")} placeholder="For example: All Grade 11 students and advisers" />
              </Field>
            </>
          )}
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="a-desc">Description</FieldLabel>
            <Textarea id="a-desc" rows={3} value={form.description} onChange={set("description")} />
          </Field>
          {holiday && <p className="text-xs text-amber-600 sm:col-span-2">Regular classes do not meet on holidays.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={pending || !form.title || !form.startDate || !form.endDate}>
            {pending && <CircleNotch className="size-4 animate-spin" />} {isAdmin ? "Save activity" : "Submit for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
