"use client";

import { useState } from "react";
import { CircleNotch, MagnifyingGlass, Siren } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ux/native-select";
import { DEFAULT_GRID, timeOptions } from "@/lib/scheduler/timetable";
import { ROOM_TYPES } from "@/lib/rooms/rooms";
import { isOverride, PRIORITY_LABEL, URGENT_REASONS, type Priority } from "@/lib/bookings/plan";
import { cn } from "@/lib/utils";
import { manilaClock } from "./format";

export interface SearchRequest {
  date: string;
  startMin: number;
  endMin: number;
  attendees: number;
  purpose: string;
  roomType: string;
  priority: Priority;
  urgentReason: string;
  reasonDetail: string;
}

type Form = { purpose: string; attendees: string; date: string; startMin: string; endMin: string; roomType: string; priority: Priority; urgentReason: string; reasonDetail: string };
type Clock = { today: string; nowMin: number };

const TYPE_OPTIONS = [{ value: "", label: "Any room type" }, ...ROOM_TYPES];
const REQUIRED: (keyof Form)[] = ["purpose", "attendees", "date", "startMin", "endMin", "urgentReason", "reasonDetail"];

/** Inline problems per field; the server checks the same rules again. */
function validate(f: Form, clock: Clock) {
  const e: Partial<Record<keyof Form, string>> = {};
  const purpose = f.purpose.trim();
  if (purpose.length < 3) e.purpose = purpose ? "Describe the purpose in at least 3 characters." : "Enter the purpose of the booking.";
  const attendees = Number(f.attendees);
  if (!Number.isInteger(attendees) || attendees < 1) e.attendees = "Attendees must be at least 1.";
  else if (attendees > 1000) e.attendees = "Attendees must be 1,000 or fewer.";
  if (!f.date) e.date = "Choose a date.";
  else if (f.date < clock.today) e.date = "The date can't be in the past.";
  else if (f.date === clock.today && Number(f.startMin) < clock.nowMin) e.startMin = "This start time has already passed.";
  if (Number(f.endMin) <= Number(f.startMin)) e.endMin = "End must be after Start.";
  if (isOverride(f.priority) && !f.urgentReason) e.urgentReason = "Choose why this booking is urgent.";
  if (isOverride(f.priority) && f.urgentReason === "OTHER" && f.reasonDetail.trim().length < 3) e.reasonDetail = "Describe the reason.";
  return e;
}

/** Purpose, attendees, date, time, room type, and priority, validated inline as the person types. */
export function SearchForm({ defaults, initial, clock: initialClock, pending, onSearch, priorities, hours }: {
  defaults: { date: string; startMin: number };
  initial?: Partial<SearchRequest> | null;
  clock: Clock;
  pending: boolean;
  onSearch: (r: SearchRequest) => void;
  priorities: readonly Priority[];
  hours: { openMin: number; closeMin: number };
}) {
  const times = timeOptions({ ...DEFAULT_GRID, dayStart: hours.openMin, dayEnd: hours.closeMin }).map((t) => ({ value: String(t.value), label: t.label }));
  const start = initial?.startMin ?? defaults.startMin;
  const [form, setForm] = useState<Form>({
    purpose: initial?.purpose ?? "",
    attendees: String(initial?.attendees ?? 30),
    date: initial?.date ?? defaults.date,
    startMin: String(start),
    endMin: String(initial?.endMin ?? Math.min(start + 60, hours.closeMin)),
    roomType: initial?.roomType ?? "",
    priority: initial?.priority && priorities.includes(initial.priority) ? initial.priority : "REGULAR",
    urgentReason: initial?.urgentReason ?? "",
    reasonDetail: initial?.reasonDetail ?? "",
  });
  // Server time until the first edit keeps the first render identical on both sides.
  const [clock, setClock] = useState(initialClock);
  // Prefilled forms (duplicate, urgent override) show their problems right away.
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>(initial ? Object.fromEntries(REQUIRED.map((k) => [k, true])) : {});
  const errors = validate(form, clock);
  const invalid = Object.keys(errors).length > 0;
  const urgent = isOverride(form.priority);
  const overrides = priorities.filter(isOverride);
  const regular = priorities.filter((p) => !isOverride(p));

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setClock(manilaClock());
    setTouched((t) => ({ ...t, [key]: true }));
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Keep a one-hour slot when a new start passes the current end.
      if (key === "startMin" && Number(next.endMin) <= Number(value)) next.endMin = String(Math.min(Number(value) + 60, hours.closeMin));
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return setTouched(Object.fromEntries(REQUIRED.map((k) => [k, true])));
    onSearch({ date: form.date, startMin: Number(form.startMin), endMin: Number(form.endMin), attendees: Number(form.attendees), purpose: form.purpose.trim(), roomType: form.roomType, priority: form.priority, urgentReason: urgent ? form.urgentReason : "", reasonDetail: urgent ? form.reasonDetail.trim() : "" });
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
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12"
      aria-label="Find a room"
    >
      <Field data-invalid={!!shown("purpose")} className="sm:col-span-2 lg:col-span-9">
        <FieldLabel htmlFor="b-purpose">Purpose <span className="text-danger" aria-hidden>*</span></FieldLabel>
        <Input id="b-purpose" required value={form.purpose} onChange={(e) => update("purpose", e.target.value)} onBlur={() => setTouched((t) => ({ ...t, purpose: true }))} placeholder="Department meeting" className="h-10" {...describe("purpose")} />
        {error("purpose")}
      </Field>
      <Field data-invalid={!!shown("attendees")} className="lg:col-span-3">
        <FieldLabel htmlFor="b-attendees">Attendees <span className="text-danger" aria-hidden>*</span></FieldLabel>
        <Input id="b-attendees" type="number" min={1} required inputMode="numeric" value={form.attendees} onChange={(e) => update("attendees", e.target.value)} className="h-10" {...describe("attendees")} />
        {error("attendees")}
      </Field>
      <Field data-invalid={!!shown("date")} className="lg:col-span-3">
        <FieldLabel htmlFor="b-date">Date</FieldLabel>
        <Input id="b-date" type="date" min={clock.today} value={form.date} onChange={(e) => update("date", e.target.value)} className="h-10" {...describe("date")} />
        {error("date")}
      </Field>
      <Field data-invalid={!!shown("startMin")} className="lg:col-span-2">
        <FieldLabel htmlFor="b-startMin">Start</FieldLabel>
        <NativeSelect id="b-startMin" value={form.startMin} onChange={(e) => update("startMin", e.target.value)} options={times} className="h-10" {...describe("startMin")} />
        {error("startMin")}
      </Field>
      <Field data-invalid={!!shown("endMin")} className="lg:col-span-2">
        <FieldLabel htmlFor="b-endMin">End</FieldLabel>
        <NativeSelect id="b-endMin" value={form.endMin} onChange={(e) => update("endMin", e.target.value)} options={times} className="h-10" {...describe("endMin")} />
        {error("endMin")}
      </Field>
      <Field className="lg:col-span-3">
        <FieldLabel htmlFor="b-roomType">Room type</FieldLabel>
        <NativeSelect id="b-roomType" value={form.roomType} onChange={(e) => update("roomType", e.target.value)} options={TYPE_OPTIONS} className="h-10" />
      </Field>
      <div className="flex flex-col justify-start gap-1.5 sm:col-span-2 lg:col-span-2">
        {/* Spacer matching the label row so the button lines up with the inputs. */}
        <span className="hidden h-5 lg:block" aria-hidden />
        <Button type="submit" className="h-10 w-full" disabled={pending || invalid} aria-describedby="b-search-help">
          {pending ? <CircleNotch className="size-4 animate-spin" /> : <MagnifyingGlass className="size-4" />}
          {pending ? "Searching…" : "Find available rooms"}
        </Button>
        <span id="b-search-help" className="sr-only">{invalid ? `Complete the form first: ${missing.join(" ")}` : "Ready to search."}</span>
      </div>

      {regular.length > 1 && !urgent && (
        <Field className="lg:col-span-3">
          <FieldLabel htmlFor="b-priority">Priority</FieldLabel>
          <NativeSelect id="b-priority" value={form.priority} onChange={(e) => update("priority", e.target.value as Priority)} options={regular.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} className="h-10" />
          <FieldDescription>High takes the room from a Regular booking.</FieldDescription>
        </Field>
      )}

      {overrides.length > 0 && (
        <div className={cn("space-y-3 rounded-lg border p-3 sm:col-span-2 lg:col-span-12", urgent && "border-danger/40 bg-danger/5")}>
          <label className="flex items-center gap-3 text-sm font-medium">
            <Switch checked={urgent} onCheckedChange={(on) => update("priority", on ? overrides[0] : "REGULAR")} aria-describedby="b-urgent-help" />
            <Siren className={cn("size-4", urgent ? "text-danger" : "text-muted-foreground")} /> Mark as urgent
          </label>
          <p id="b-urgent-help" className="text-[13px] text-muted-foreground">An urgent booking can take a room used by a class or a lower-priority booking. Displaced classes move to another room or time, and everyone affected is notified.</p>
          {urgent && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
              {overrides.length > 1 && (
                <Field className="lg:col-span-3">
                  <FieldLabel htmlFor="b-override">Level</FieldLabel>
                  <NativeSelect id="b-override" value={form.priority} onChange={(e) => update("priority", e.target.value as Priority)} options={overrides.map((p) => ({ value: p, label: p === "CRITICAL" ? "Critical (President or Dean level)" : PRIORITY_LABEL[p] }))} className="h-10" />
                </Field>
              )}
              <Field data-invalid={!!shown("urgentReason")} className="lg:col-span-4">
                <FieldLabel htmlFor="b-urgentReason">Reason <span className="text-danger" aria-hidden>*</span></FieldLabel>
                <NativeSelect id="b-urgentReason" value={form.urgentReason} onChange={(e) => update("urgentReason", e.target.value)} placeholder="Choose a reason" options={URGENT_REASONS.map((r) => ({ value: r.value, label: r.label }))} className="h-10" {...describe("urgentReason")} />
                {error("urgentReason")}
              </Field>
              <Field data-invalid={!!shown("reasonDetail")} className="sm:col-span-2 lg:col-span-5">
                <FieldLabel htmlFor="b-reasonDetail">Details{form.urgentReason === "OTHER" && <span className="text-danger" aria-hidden> *</span>}</FieldLabel>
                <Input id="b-reasonDetail" value={form.reasonDetail} maxLength={300} onChange={(e) => update("reasonDetail", e.target.value)} placeholder="Commission on Higher Education visit" className="h-10" {...describe("reasonDetail")} />
                {error("reasonDetail")}
              </Field>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
