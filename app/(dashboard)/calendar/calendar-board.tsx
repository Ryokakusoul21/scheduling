"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CaretLeft, CaretRight, Check, CircleNotch, Clock, MapPin, Plus, User, WarningCircle } from "@phosphor-icons/react/ssr";
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
  VALUE_PALETTE,
  findConflicts,
  formatLongDate,
  shiftDate,
  type CalendarView,
  type EventResources,
  CONFLICT_LABELS,
  type EventType,
} from "@/lib/calendar";
import { DEFAULT_GRID, formatRange, formatTime, timeOptions } from "@/lib/scheduler/timetable";
import { ACADEMIC_LEVELS, levelLabel } from "@/lib/academics/levels";
import type { ActivityListItem } from "@/lib/activities/status";
import { cn } from "@/lib/utils";
import { ConflictAlert } from "@/components/ux/conflict";
import { deleteActivityAction, saveActivityAction, type ActivityInput } from "./actions";
import { Chip, DAY_END, TimeGrid, WORK_END, isAllDay, onDate, type Conflicts } from "./time-grid";

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
  /** Not yet approved; shown only to the Registrar and the submitting department. */
  pending?: boolean;
  activity?: ActivityListItem;
  /** Display fields for cells, tooltips, grouping, and coloring. */
  info?: { code?: string; subject?: string; room?: string; section?: string; faculty?: string; department?: string; stage?: string };
  resources?: EventResources;
}

/** Choices for the activity form. */
export interface ActivityFormOptions {
  departments: { value: string; label: string }[];
  rooms: { value: string; label: string }[];
  ownDepartmentId: string | null;
}

/** Whether the person may edit or remove this activity: Registrar any, Head of Department their department's events. */
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

const TIMES = timeOptions({ ...DEFAULT_GRID, dayEnd: DAY_END }).map((t) => ({ value: String(t.value), label: t.label }));
const SCOPE_LABELS: Record<string, string> = { all: "All classes", department: "My department's classes", mine: "My classes only" };
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type GroupBy = "none" | "room" | "section" | "faculty";
type ColorBy = "type" | "department" | "stage" | "room";
const GROUP_OPTIONS = [{ value: "none", label: "Group by: None" }, { value: "room", label: "Group by: Room" }, { value: "section", label: "Group by: Section" }, { value: "faculty", label: "Group by: Faculty" }];
const COLOR_OPTIONS = [{ value: "type", label: "Color by: Type" }, { value: "department", label: "Color by: Department" }, { value: "stage", label: "Color by: Year level" }, { value: "room", label: "Color by: Room" }];

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
  const [group, setGroup] = useState<{ events: CalendarEvent[]; label: string } | null>(null);
  const [moreQuery, setMoreQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  // The "more items" list is searchable and grouped by start time.
  const moreGroups = useMemo(() => {
    const q = moreQuery.trim().toLowerCase();
    const hits = (group?.events ?? []).filter((e) => !q || [e.info?.code, e.title, e.info?.subject, e.info?.room, e.info?.section].filter(Boolean).join(" ").toLowerCase().includes(q));
    const byStart = new Map<number, CalendarEvent[]>();
    hits.forEach((e) => byStart.set(e.startMin!, [...(byStart.get(e.startMin!) ?? []), e]));
    return [...byStart].sort(([a], [b]) => a - b).map(([start, list]) => [formatTime(start), list] as const);
  }, [group, moreQuery]);
  const [slice, setSlice] = useState("");
  const [colorBy, setColorBy] = useState<ColorBy>("type");
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; form: ActivityForm } | null>(null);

  const go = (next: Partial<{ view: CalendarView; date: string; scope: string }>) => {
    const p = new URLSearchParams({ view, date, scope: classScope, ...next });
    router.push(`/calendar?${p}`);
  };
  // Values for the chosen grouping; events without one (holidays, school events) stay visible in every slice.
  const sliceOptions = useMemo(() => (groupBy === "none" ? [] : [...new Set(events.map((e) => e.info?.[groupBy]).filter(Boolean) as string[])].sort()), [events, groupBy]);
  const activeSlice = sliceOptions.includes(slice) ? slice : sliceOptions[0] ?? "";
  const visible = useMemo(
    () => events.filter((e) => !hidden.has(e.type) && (groupBy === "none" || !e.info?.[groupBy] || e.info[groupBy] === activeSlice)),
    [events, hidden, groupBy, activeSlice],
  );
  const conflicts: Conflicts = useMemo(
    () => findConflicts(events.filter((e) => !isAllDay(e) && e.resources).map((e) => ({ id: e.id, date: e.date, startMin: e.startMin!, endMin: e.endMin!, ...e.resources }))),
    [events],
  );
  // Stable palette index per value so the legend and cells agree.
  const valueColors = useMemo(() => {
    if (colorBy === "type") return new Map<string, number>();
    const values = [...new Set(visible.map((e) => e.info?.[colorBy]).filter(Boolean) as string[])].sort();
    return new Map(values.map((v, i) => [v, i % VALUE_PALETTE.length]));
  }, [visible, colorBy]);
  const colorOf = (e: CalendarEvent) => {
    const v = colorBy === "type" ? undefined : e.info?.[colorBy];
    return v !== undefined && valueColors.has(v) ? VALUE_PALETTE[valueColors.get(v)!].cell : EVENT_COLORS[e.type];
  };
  const late = visible.filter((e) => !isAllDay(e) && e.endMin! > WORK_END).length;
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
            {view !== "month" && (
              <>
                <NativeSelect aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} options={GROUP_OPTIONS} className="w-44" />
                {groupBy !== "none" && (
                  <NativeSelect aria-label={`Choose ${groupBy}`} value={activeSlice} onChange={(e) => setSlice(e.target.value)} options={sliceOptions.map((v) => ({ value: v, label: v }))} placeholder={sliceOptions.length ? undefined : "Nothing to group"} className="w-48" />
                )}
              </>
            )}
            <NativeSelect aria-label="Color by" value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)} options={COLOR_OPTIONS} className="w-48" />
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

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show or hide activity types">
          <span className="text-xs text-muted-foreground">Show:</span>
          {EVENT_TYPES.map((t) => {
            const on = !hidden.has(t);
            return (
              <button key={t} onClick={() => toggle(t)} aria-pressed={on} title={`${on ? "Hide" : "Show"} ${EVENT_LABELS[t].toLowerCase()}`} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", on ? "bg-card" : "border-dashed text-muted-foreground line-through opacity-60")}>
                {on ? <Check weight="bold" className="size-3" /> : <span className="size-3" />}
                <span className={cn("size-2.5 rounded-full", EVENT_DOTS[t], !on && "opacity-40")} /> {EVENT_LABELS[t]}
              </button>
            );
          })}
          {view !== "month" && (
            <Button size="sm" variant="ghost" className="ml-auto" aria-pressed={expanded} onClick={() => setExpanded((x) => !x)}>
              {expanded ? "Show 7:00 AM to 6:00 PM" : `Expand hours${late ? ` (${late} after 6:00 PM)` : ""}`}
            </Button>
          )}
        </div>
        {colorBy !== "type" && valueColors.size > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Color legend">
            {[...valueColors].map(([v, i]) => <span key={v} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", VALUE_PALETTE[i].dot)} />{v}</span>)}
          </div>
        )}
        {events.some((e) => e.pending) && (
          <p className="text-xs text-muted-foreground">
            <span className="mr-1 inline-block rounded border border-dashed border-amber-500 px-1.5 italic">Pending</span>
            Dashed, faded items await approval and are visible only to the Registrar and the submitting department.
          </p>
        )}

        {view === "month" ? (
          <MonthGrid from={from} to={to} month={date.slice(0, 7)} today={today} events={visible} colorOf={colorOf} onDay={(d) => go({ view: "day", date: d })} onSelect={setSelected} />
        ) : (
          <TimeGrid
            dates={view === "week" ? eachDate(from, to) : [date]}
            today={today}
            events={visible}
            dayEnd={expanded ? DAY_END : WORK_END}
            colorOf={colorOf}
            conflicts={conflicts}
            onSelect={setSelected}
            onDay={(d) => go({ view: "day", date: d })}
            onMore={(list, label) => setGroup({ events: list, label })}
          />
        )}
      </CardContent>

      <Dialog open={!!group} onOpenChange={(o) => { if (!o) { setGroup(null); setMoreQuery(""); } }}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{group?.label} <Badge variant="secondary">{group?.events.length} items</Badge></DialogTitle>
            <DialogDescription>Choose one to see its details.</DialogDescription>
          </DialogHeader>
          <Input value={moreQuery} onChange={(e) => setMoreQuery(e.target.value)} placeholder="Search code, subject, room, or section" aria-label="Search these items" className="h-9" />
          <div className="-mx-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
            {moreGroups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches your search.</p>}
            {moreGroups.map(([time, list]) => (
              <section key={time} aria-label={time}>
                <h3 className="sticky top-0 z-10 bg-popover py-1 text-xs font-semibold text-muted-foreground">{time}</h3>
                <ul className="space-y-1">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => { setGroup(null); setMoreQuery(""); setSelected(e); }} className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", conflicts.has(e.id) && "border-red-500/60")}>
                        <span className={cn("size-3 shrink-0 rounded-full border", colorOf(e))} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-sm font-semibold">
                            {conflicts.has(e.id) && <WarningCircle weight="fill" className="size-4 text-red-600" aria-label="Conflict" />}
                            {e.info?.code ?? e.title}
                            {e.pending && <Badge variant="secondary" className="ml-1">Pending</Badge>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{[e.info?.subject, e.info?.room, e.info?.section].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatRange(e.startMin!, e.endMin!)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <EventDialog
        event={selected}
        conflict={selected ? conflicts.get(selected.id) : undefined}
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

function MonthGrid({ from, to, month, today, events, colorOf, onDay, onSelect }: { from: string; to: string; month: string; today: string; events: CalendarEvent[]; colorOf: (e: CalendarEvent) => string; onDay: (d: string) => void; onSelect: (e: CalendarEvent) => void }) {
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
              {others.slice(0, 3).map((e) => <Chip key={e.id} e={e} color={colorOf(e)} onSelect={onSelect} />)}
              {others.length > 3 && <button onClick={() => onDay(d)} className="text-xs text-muted-foreground hover:underline">+{others.length - 3} more</button>}
              {classes.length > 0 && (
                <button onClick={() => onDay(d)} className={cn("block w-full truncate rounded border px-1.5 py-0.5 text-left text-xs", EVENT_COLORS.CLASS)}>
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

/** Soft header tint per activity type, taken from the same colours used on the calendar. */
const colorOfType = (type: CalendarEvent["type"]) => EVENT_COLORS[type];

function EventDialog({ event, conflict, onClose, canEdit, onEdit, onDeleted }: { event: CalendarEvent | null; conflict?: Set<"ROOM" | "FACULTY" | "SECTION">; onClose: () => void; canEdit: (e: CalendarEvent) => boolean; onEdit: (e: CalendarEvent) => void; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();
  if (!event) return null;
  const when = event.date === event.endDate ? formatLongDate(event.date) : `${formatLongDate(event.date)} to ${formatLongDate(event.endDate)}`;
  const info = event.info;
  const facts = info?.code ? [
    [event.type === "EXAMINATION" ? "Proctor" : event.type === "BOOKING" ? "Booked by" : "Faculty", info.faculty, User],
    ["Room", info.room, MapPin],
    ["Section", info.section, null],
    ["Year level", info.stage, null],
  ].filter(([, v]) => v) as [string, string, typeof User | null][] : [];
  const canChange = canEdit(event);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className={cn("border-b p-5 pr-12", colorOfType(event.type))}>
          <div className="mb-2 flex flex-wrap gap-1.5"><Badge variant="secondary">{EVENT_LABELS[event.type]}</Badge>{(event.badge ?? (event.pending ? "Pending approval" : null)) && <Badge variant="outline">{event.badge ?? "Pending approval"}</Badge>}</div>
          <DialogTitle className="text-lg leading-snug">{info?.code ? `${info.code} ${info.subject ?? event.title}` : event.title}</DialogTitle>
          <DialogDescription className="sr-only">Details for {event.title}</DialogDescription>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <Clock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">{when}</p>
              <p className="text-muted-foreground">{isAllDay(event) ? "Whole day" : formatRange(event.startMin!, event.endMin!)}</p>
            </div>
          </div>
          {conflict && (
            <ConflictAlert title="Double booking detected" items={[...conflict].map((w) => CONFLICT_LABELS[w].charAt(0).toUpperCase() + CONFLICT_LABELS[w].slice(1))}>Open the Scheduler to move one of these classes.</ConflictAlert>
          )}
          {facts.length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="rounded-lg border p-2.5">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {event.detail && <p className="whitespace-pre-line rounded-lg border border-dashed p-2.5 text-muted-foreground">{event.detail}</p>}
        </div>
        {(event.href || canChange) && (
          <DialogFooter className="m-0 rounded-none border-t bg-muted/30 p-3">
            {event.href && <Button variant="outline" nativeButton={false} render={<Link href={event.href} />}>Open {event.type === "CLASS_SUSPENSION" ? "Schedule Adjustments" : EVENT_LABELS[event.type]}</Button>}
            {canChange && (
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
        )}
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

/** Add or edit form; a Head of Department's save is a submission that waits for the Registrar's approval. */
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
              : "Submitted and edited activities reach the official calendar after the Registrar approves them."}
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
