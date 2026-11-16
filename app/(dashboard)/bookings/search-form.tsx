"use client";

import { useState } from "react";
import { CircleNotch, MagnifyingGlass, Siren } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { DEFAULT_GRID, formatTime, timeOptions } from "@/lib/scheduler/timetable";
import { dailyDates, isOverride, MAX_RANGE_DAYS, MAX_REPEATS, PRIORITY_LABEL, URGENT_REASONS, weeklyDates, type Priority } from "@/lib/bookings/plan";
import { cn } from "@/lib/utils";
import { manilaClock } from "./format";

export interface SearchRequest {
  date: string;
  startMin: number;
  endMin: number;
  attendees: number;
  purpose: string;
  /** Empty means any room; otherwise only this room is checked. */
  roomId: string;
  priority: Priority;
  urgentReason: string;
  reasonDetail: string;
  /** Last date of a weekly repeat; empty for a single booking. */
  repeatUntil: string;
  /** Last day of a daily date range; empty for a single day. */
  endDate: string;
}

type Form = {
  purpose: string; attendees: string; date: string; endDate: string; startMin: string; endMin: string; roomId: string;
  priority: Priority; urgentReason: string; reasonDetail: string; repeat: boolean; repeatUntil: string;
};
type Clock = { today: string; nowMin: number };

const REQUIRED: (keyof Form)[] = ["purpose", "attendees", "date", "endDate", "startMin", "endMin", "urgentReason", "reasonDetail", "repeatUntil"];
const OVERRIDE_HELP = "An urgent booking can take a room used by a class or a lower-priority booking. Displaced classes move to another room or time, and everyone affected is notified.";
const PRIORITY_HELP: Record<Priority, string> = {
  REGULAR: "Takes a free room only.",
  HIGH: "High takes the room from a Regular booking.",
  URGENT: OVERRIDE_HELP,
  CRITICAL: OVERRIDE_HELP,
};

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });

/** Inline problems per field; the server checks the same rules again. */
function validate(f: Form, clock: Clock, closeMin: number) {
  const e: Partial<Record<keyof Form, string>> = {};
  const purpose = f.purpose.trim();
  if (purpose.length < 3) e.purpose = purpose ? "Describe the purpose in at least 3 characters." : "Enter the purpose of the booking.";
  const attendees = Number(f.attendees);
  if (!f.attendees.trim() || !Number.isInteger(attendees) || attendees < 1) e.attendees = "Enter how many people will attend (at least 1).";
  else if (attendees > 1000) e.attendees = "Attendees must be 1,000 or fewer.";
  if (!f.date) e.date = "Choose a date.";
  else if (f.date < clock.today) e.date = "The date can't be in the past.";
  else if (f.date === clock.today && Number(f.startMin) < clock.nowMin) e.startMin = "This start time has already passed.";
  if (f.endDate && f.date && f.endDate < f.date) e.endDate = "The end date can't be before the start date.";
  else if (f.endDate && f.date && dailyDates(f.date, f.endDate).length >= MAX_RANGE_DAYS) e.endDate = `A date range can cover up to ${MAX_RANGE_DAYS} days.`;
  if (Number(f.endMin) <= Number(f.startMin)) e.endMin = "The end time must be after the start time.";
  else if (Number(f.endMin) > closeMin) e.endMin = `This ends after closing time (${formatTime(closeMin)}).`;
  if (isOverride(f.priority) && !f.urgentReason) e.urgentReason = "Choose why this booking is urgent.";
  if (isOverride(f.priority) && f.urgentReason === "OTHER" && f.reasonDetail.trim().length < 3) e.reasonDetail = "Describe the reason.";
  if (f.repeat && !isOverride(f.priority) && !(f.endDate && f.endDate > f.date)) {
    const count = f.repeatUntil && f.date ? weeklyDates(f.date, f.repeatUntil).length : 0;
    if (!f.repeatUntil) e.repeatUntil = "Choose the last date to repeat.";
    else if (count === 0) e.repeatUntil = "Choose a date at least one week after the first booking.";
    else if (count > MAX_REPEATS) e.repeatUntil = `A repeat can run for up to ${MAX_REPEATS} more weeks.`;
  }
  return e;
}

/** Purpose, attendees, date, time, room, and priority, validated inline as the person types. */
export function SearchForm({ defaults, initial, clock: initialClock, pending, onSearch, priorities, hours, roomChoices }: {
  defaults: { date: string; startMin: number };
  initial?: Partial<SearchRequest> | null;
  clock: Clock;
  pending: boolean;
  onSearch: (r: SearchRequest) => void;
  priorities: readonly Priority[];
  hours: { openMin: number; closeMin: number };
  roomChoices: { value: string; label: string }[];
}) {
  const times = timeOptions({ ...DEFAULT_GRID, dayStart: hours.openMin, dayEnd: hours.closeMin }).map((t) => ({ value: String(t.value), label: t.label }));
  // Closing time is a valid end even when the start list stops before it; never list it twice.
  const endTimes = times.some((t) => t.value === String(hours.closeMin)) ? times.slice(1) : [...times.slice(1), { value: String(hours.closeMin), label: formatTime(hours.closeMin) }];
  const start = initial?.startMin ?? defaults.startMin;
  const initialEnd = initial?.endMin !== undefined && initial.endMin > start ? initial.endMin : Math.min(start + 60, hours.closeMin);
  const [form, setForm] = useState<Form>({
    purpose: initial?.purpose ?? "",
    // Left blank on purpose: the number decides which rooms fit, so it should be entered, not assumed.
    attendees: initial?.attendees ? String(initial.attendees) : "",
    date: initial?.date ?? defaults.date,
    endDate: initial?.endDate ?? "",
    startMin: String(start),
    endMin: String(initialEnd),
    roomId: initial?.roomId ?? "",
    priority: initial?.priority && priorities.includes(initial.priority) ? initial.priority : "REGULAR",
    urgentReason: initial?.urgentReason ?? "",
    reasonDetail: initial?.reasonDetail ?? "",
    repeat: !!initial?.repeatUntil,
    repeatUntil: initial?.repeatUntil ?? "",
  });
  // Server time until the first edit keeps the first render identical on both sides.
  const [clock, setClock] = useState(initialClock);
  // Prefilled forms (duplicate, urgent override) show their problems right away.
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>(initial ? Object.fromEntries(REQUIRED.map((k) => [k, true])) : {});
  const errors = validate(form, clock, hours.closeMin);
  const invalid = Object.keys(errors).length > 0;
  const urgent = isOverride(form.priority);
  const endMin = Number(form.endMin);
  // A multi-day range books every day in it, so a weekly repeat is not offered alongside it.
  const multiDay = !!form.endDate && form.endDate > form.date;

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setClock(manilaClock());
    setTouched((t) => ({ ...t, [key]: true }));
    // An urgent booking can displace classes, so it is never repeated automatically.
    setForm((f) => {
      const next = { ...f, [key]: value, ...(key === "priority" && isOverride(value as Priority) ? { repeat: false } : {}) };
      // Moving the start keeps the same length when possible.
      if (key === "startMin") next.endMin = String(Math.min(Number(value) + Number(f.endMin) - Number(f.startMin), hours.closeMin));
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return setTouched(Object.fromEntries(REQUIRED.map((k) => [k, true])));
    onSearch({
      date: form.date, startMin: Number(form.startMin), endMin, attendees: Number(form.attendees), purpose: form.purpose.trim(),
      roomId: form.roomId, priority: form.priority,
      urgentReason: urgent ? form.urgentReason : "", reasonDetail: urgent ? form.reasonDetail.trim() : "",
      repeatUntil: form.repeat && !urgent && !multiDay ? form.repeatUntil : "",
      endDate: multiDay ? form.endDate : "",
    });
  }

  const shown = (key: keyof Form) => (touched[key] ? errors[key] : undefined);
  const describe = (key: keyof Form) => ({ "aria-invalid": !!shown(key), "aria-describedby": shown(key) ? `b-${key}-error` : undefined });
  const error = (key: keyof Form) => <FieldError id={`b-${key}-error`} errors={[shown(key) ? { message: shown(key) } : undefined]} />;
  const missing = Object.values(errors);

  return (
    <form
      onSubmit={submit}
      noValidate
      // Enter in a select also runs the search, as it does in text fields.
      onKeyDown={(e) => e.key === "Enter" && e.target instanceof HTMLSelectElement && (e.preventDefault(), e.currentTarget.requestSubmit())}
      className="grid grid-cols-2 gap-x-3 gap-y-4"
      aria-label="Find a room"
    >
      <Field data-invalid={!!shown("purpose")} className="col-span-2">
        <FieldLabel htmlFor="b-purpose">Purpose <span className="text-danger" aria-hidden>*</span></FieldLabel>
        <Input id="b-purpose" required value={form.purpose} onChange={(e) => update("purpose", e.target.value)} onBlur={() => setTouched((t) => ({ ...t, purpose: true }))} placeholder="Department meeting" className="h-10" {...describe("purpose")} />
        {error("purpose")}
      </Field>

      <Field data-invalid={!!shown("attendees")} className="col-span-2">
        <FieldLabel htmlFor="b-attendees">Attendees <span className="text-danger" aria-hidden>*</span></FieldLabel>
        <Input id="b-attendees" type="number" min={1} required inputMode="numeric" placeholder="For example 30" value={form.attendees} onChange={(e) => update("attendees", e.target.value)} className="h-10" {...describe("attendees")} />
        {error("attendees")}
      </Field>
      <Field data-invalid={!!shown("date")}>
        <FieldLabel htmlFor="b-date">From date</FieldLabel>
        <Input id="b-date" type="date" min={clock.today} value={form.date} onChange={(e) => update("date", e.target.value)} className="h-10" {...describe("date")} />
        {error("date")}
      </Field>
      <Field data-invalid={!!shown("endDate")}>
        <FieldLabel htmlFor="b-endDate">To date</FieldLabel>
        <Input id="b-endDate" type="date" min={form.date || clock.today} value={form.endDate} onChange={(e) => update("endDate", e.target.value)} className="h-10" {...describe("endDate")} />
        {error("endDate")}
      </Field>

      <Field data-invalid={!!shown("startMin")}>
        <FieldLabel htmlFor="b-startMin">From time</FieldLabel>
        <NativeSelect id="b-startMin" value={form.startMin} onChange={(e) => update("startMin", e.target.value)} options={times.filter((t) => Number(t.value) < hours.closeMin)} className="h-10" {...describe("startMin")} />
        {error("startMin")}
      </Field>
      <Field data-invalid={!!shown("endMin")}>
        <FieldLabel htmlFor="b-endMin">To time</FieldLabel>
        <NativeSelect id="b-endMin" value={form.endMin} onChange={(e) => update("endMin", e.target.value)} options={endTimes.filter((t) => Number(t.value) > Number(form.startMin))} className="h-10" {...describe("endMin")} />
        {error("endMin")}
      </Field>

      <Field className="col-span-2">
        <FieldLabel htmlFor="b-roomId">Room name</FieldLabel>
        <NativeSelect id="b-roomId" value={form.roomId} onChange={(e) => update("roomId", e.target.value)} options={[{ value: "", label: "Any available room" }, ...roomChoices]} className="h-10" />
      </Field>

      {priorities.length > 1 && (
        <div className={cn("col-span-2 space-y-3 rounded-xl border bg-muted/30 p-3.5", urgent && "border-danger/40 bg-danger/5")}>
          <div className="space-y-1.5">
            <p id="b-priority-label" className="text-sm font-medium">Priority</p>
            <div role="radiogroup" aria-labelledby="b-priority-label" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
              {priorities.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={form.priority === p} onClick={() => update("priority", p)}
                  className={cn("inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    form.priority === p ? (isOverride(p) ? "bg-danger text-white shadow-sm" : "bg-card shadow-sm") : "text-muted-foreground hover:text-foreground")}>
                  {isOverride(p) && <Siren className="size-4" aria-hidden />} {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">{PRIORITY_HELP[form.priority]}</p>
          </div>
          {urgent && (
            <>
              <Field data-invalid={!!shown("urgentReason")}>
                <FieldLabel htmlFor="b-urgentReason">Reason <span className="text-danger" aria-hidden>*</span></FieldLabel>
                <NativeSelect id="b-urgentReason" value={form.urgentReason} onChange={(e) => update("urgentReason", e.target.value)} placeholder="Choose a reason" options={URGENT_REASONS.map((r) => ({ value: r.value, label: r.label }))} className="h-10" {...describe("urgentReason")} />
                {error("urgentReason")}
              </Field>
              <Field data-invalid={!!shown("reasonDetail")}>
                <FieldLabel htmlFor="b-reasonDetail">Details{form.urgentReason === "OTHER" && <span className="text-danger" aria-hidden> *</span>}</FieldLabel>
                <Input id="b-reasonDetail" value={form.reasonDetail} maxLength={300} onChange={(e) => update("reasonDetail", e.target.value)} placeholder="Commission on Higher Education visit" className="h-10" {...describe("reasonDetail")} />
                {error("reasonDetail")}
              </Field>
            </>
          )}
        </div>
      )}

      {!urgent && !multiDay && (
        <div className="col-span-2 space-y-2">
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium select-none">
            <Checkbox checked={form.repeat} onCheckedChange={(on) => update("repeat", !!on)} />
            Repeat every {form.date ? weekday(form.date) : "week"}
          </label>
          {form.repeat && (
            <Field data-invalid={!!shown("repeatUntil")}>
              <FieldLabel htmlFor="b-repeatUntil">Repeat until</FieldLabel>
              <Input id="b-repeatUntil" type="date" min={form.date ? addDays(form.date, 7) : clock.today} value={form.repeatUntil} onChange={(e) => update("repeatUntil", e.target.value)} className="h-10" {...describe("repeatUntil")} />
              {error("repeatUntil")}
              <FieldDescription>Dates when the room is taken, on a holiday, or closed are skipped and listed afterwards.</FieldDescription>
            </Field>
          )}
        </div>
      )}

      <div className="col-span-2 space-y-1.5">
        <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm" disabled={pending || invalid} aria-describedby="b-search-help">
          {pending ? <CircleNotch className="size-4 animate-spin" /> : <MagnifyingGlass className="size-4" />}
          {pending ? "Searching…" : form.roomId ? "Check this room" : "Find available rooms"}
        </Button>
        <span id="b-search-help" className="sr-only">{invalid ? `Complete the form first: ${missing.join(" ")}` : "Ready to search."}</span>
      </div>
    </form>
  );
}
