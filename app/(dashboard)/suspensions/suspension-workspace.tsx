"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, CalendarBlank, CheckCircle, CircleNotch, Eye, MagnifyingGlass, Prohibit, ShieldCheck, VideoCamera } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ux/native-select";
import { ChangeList } from "@/components/scheduler/change-list";
import { DEFAULT_GRID, formatRange, timeOptions } from "@/lib/scheduler/timetable";
import { levelLabel, type AcademicLevel } from "@/lib/academics/levels";
import type { AdjustmentPlan } from "@/lib/occupancy/adjust";
import type { DeliveryMode } from "@/lib/suspensions/continuity";
import { cn } from "@/lib/utils";
import { MakeUpPicker } from "../adjustments/adjustment-workspace";
import { applySuspensionAction, liftSuspensionAction, previewSuspensionAction, type SuspensionPreview, type SuspensionRequest } from "./actions";

export interface OrderView {
  id: string; title: string; reason: string; start: string; end: string;
  startMin: number | null; endMin: number | null; sections: number; meetings: number; allLevels: boolean;
  mode: DeliveryMode; meetingLink: string | null; issuedBy: string; status: "ACTIVE" | "LIFTED"; liftedBy: string | null; canLift: boolean;
}
type Choice = { value: string; label: string; detail: string };
type Target = "PROGRAMS" | "SECTIONS" | "CLASSES" | "LEVEL" | "SCHOOL";
const TIMES = timeOptions({ ...DEFAULT_GRID, dayEnd: 21 * 60 }).map((time) => ({ value: String(time.value), label: time.label }));

export function SuspensionWorkspace(props: {
  level: AcademicLevel; availableLevels: AcademicLevel[]; today: string; programs: (Choice & { sections: number })[]; sections: Choice[]; classes: Choice[]; canSuspendLevel: boolean; orders: OrderView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ mode: "SUSPEND" as DeliveryMode, target: (props.programs.length ? "PROGRAMS" : "SECTIONS") as Target, selected: [] as string[], title: "", reason: "", start: props.today, end: props.today, allDay: true, startMin: "480", endMin: "1020", meetingLink: "", instructions: "" });
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<SuspensionPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<{ id: string; batchId: string; plan: AdjustmentPlan; mode: DeliveryMode } | null>(null);
  const [history, setHistory] = useState("ACTIVE");
  const virtual = form.mode === "VIRTUAL";
  const broad = form.target === "LEVEL" || form.target === "SCHOOL";
  const options = form.target === "PROGRAMS" ? props.programs : form.target === "SECTIONS" ? props.sections : props.classes;
  const visible = useMemo(() => options.filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(query.trim().toLowerCase())), [options, query]);
  const activeOrders = props.orders.filter((order) => order.status === "ACTIVE");
  const update = (patch: Partial<typeof form>) => { setForm((current) => ({ ...current, ...patch })); setPreview(null); setConfirmed(false); setError(""); };
  const request = (): SuspensionRequest => ({
    mode: form.mode, title: form.title, reason: form.reason, start: form.start, end: form.end,
    startMin: form.allDay ? null : Number(form.startMin), endMin: form.allDay ? null : Number(form.endMin),
    programIds: form.target === "PROGRAMS" ? form.selected : [], sectionIds: form.target === "SECTIONS" ? form.selected : [], scheduleIds: form.target === "CLASSES" ? form.selected : [],
    level: form.target === "SCHOOL" ? null : props.level as SuspensionRequest["level"], meetingLink: virtual ? form.meetingLink : "", instructions: virtual ? form.instructions : "",
  });
  const fail = (message: string) => { setError(message); toast.error(message); };

  function runPreview(event: React.FormEvent) {
    event.preventDefault(); setApplied(null); setError(""); setConfirmed(false);
    startTransition(async () => {
      const result = await previewSuspensionAction(request());
      if (result.ok) setPreview(result.data); else fail(result.error);
    });
  }
  function apply() {
    if (!preview || !confirmed) return;
    startTransition(async () => {
      const result = await applySuspensionAction(request(), preview.fingerprint);
      if (!result.ok) { setPreview(null); setConfirmed(false); return fail(result.error); }
      setApplied({ ...result.data, mode: form.mode }); setPreview(null); setConfirmed(false);
      toast.success(`${result.data.plan.items.length} meetings ${virtual ? "moved to virtual delivery" : "suspended"}. Affected faculty and students were notified.`);
      router.refresh();
    });
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
      <p className="flex items-center gap-2 text-sm"><ShieldCheck className="size-5 text-primary" /><span>{props.canSuspendLevel ? "School-wide authority" : "Your assigned department and programs only"}</span></p>
      <div className="flex flex-wrap items-center gap-2">{props.availableLevels.length > 1 && <NativeSelect aria-label="Academic level you handle" value={props.level} onChange={(event) => router.push(`/suspensions?level=${encodeURIComponent(event.target.value)}`)} options={props.availableLevels.map((value) => ({ value, label: levelLabel(value) }))} />}<Badge variant="secondary">{props.classes.length} published classes</Badge><Badge variant="outline">{activeOrders.length} active arrangements</Badge></div>
    </div>

    <form onSubmit={runPreview}>
      <fieldset disabled={pending} className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card><CardHeader><CardTitle>1. Choose how classes will continue</CardTitle><p className="text-xs text-muted-foreground">Virtual classes keep the original time and teacher. Suspended meetings can be made up later.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
            {([{ mode: "SUSPEND", title: "Suspend classes", description: "Cancel the selected meetings for these dates. Arrange make-up classes when needed.", icon: Prohibit }, { mode: "VIRTUAL", title: "Hold virtual classes", description: "Continue teaching online at the same time. Release the physical classroom.", icon: VideoCamera }] as const).map(({ mode, title, description, icon: Icon }) => <label key={mode} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40", form.mode === mode && "border-primary bg-primary/5 ring-1 ring-primary/20")}><input type="radio" name="delivery-mode" value={mode} checked={form.mode === mode} onChange={() => update({ mode })} className="mt-1 size-4 accent-primary" /><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="size-5 text-primary" />{title}</div><p className="text-xs leading-relaxed text-muted-foreground">{description}</p></div></label>)}
          </CardContent></Card>

          <Card><CardHeader><CardTitle>2. Select the classes you handle</CardTitle><p className="text-xs text-muted-foreground">Choose a whole program, specific sections, or individual subject meetings.</p></CardHeader><CardContent className="space-y-4">
            <div role="group" aria-label="Class selection type" className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
              {([{ value: "PROGRAMS", label: "Programs" }, { value: "SECTIONS", label: "Sections" }, { value: "CLASSES", label: "Individual classes" }, ...(props.canSuspendLevel ? [{ value: "LEVEL", label: "Whole level" }, { value: "SCHOOL", label: "All levels" }] : [])] as { value: Target; label: string }[]).map((target) => <button key={target.value} type="button" aria-pressed={form.target === target.value} onClick={() => { update({ target: target.value, selected: [] }); setQuery(""); }} className={cn("rounded-md px-3 py-2 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring", form.target === target.value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{target.label}</button>)}
            </div>
            {broad ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">{form.target === "SCHOOL" ? "Every published class across all academic levels" : `Every published class in ${levelLabel(props.level)}`} may be affected. Review the full impact before confirming.</p> : <>
              <div className="flex flex-wrap items-center justify-between gap-2"><label className="relative w-full sm:max-w-sm"><MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden /><Input aria-label="Search classes to change" placeholder="Search names, subjects, or faculty…" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></label><div className="flex items-center gap-3 text-xs"><span className="text-muted-foreground">{form.selected.length} selected</span><button type="button" disabled={!visible.length} className="font-medium text-primary hover:underline" onClick={() => update({ selected: [...new Set([...form.selected, ...visible.map((option) => option.value)])] })}>Select shown</button><button type="button" disabled={!form.selected.length} className="text-muted-foreground hover:underline" onClick={() => update({ selected: [] })}>Clear</button></div></div>
              <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2" role="group" aria-label="Classes in your scope">{visible.map((option) => <label key={option.value} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40", form.selected.includes(option.value) && "border-primary/60 bg-primary/5")}><input type="checkbox" checked={form.selected.includes(option.value)} onChange={(event) => update({ selected: event.target.checked ? [...form.selected, option.value] : form.selected.filter((value) => value !== option.value) })} className="mt-0.5 size-4 shrink-0 accent-primary" /><span className="min-w-0"><span className="block text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.detail}</span></span></label>)}{!visible.length && <p className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{options.length ? "No matches. Try another search." : "No available records in this selection. Try sections or another academic level."}</p>}</div>
            </>}
          </CardContent></Card>

          <Card><CardHeader><CardTitle>3. Set the dates & announcement</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="s-start">From date</FieldLabel><Input id="s-start" type="date" value={form.start} required onChange={(event) => update({ start: event.target.value, end: event.target.value > form.end ? event.target.value : form.end })} /></Field><Field><FieldLabel htmlFor="s-end">To date</FieldLabel><Input id="s-end" type="date" value={form.end} min={form.start} required onChange={(event) => update({ end: event.target.value })} /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={form.allDay} onChange={(event) => update({ allDay: event.target.checked })} />Whole day <span className="text-xs text-muted-foreground">All matching class times on the chosen dates</span></label>
            {!form.allDay && <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="s-from">From time</FieldLabel><NativeSelect id="s-from" value={form.startMin} onChange={(event) => update({ startMin: event.target.value })} options={TIMES} /></Field><Field><FieldLabel htmlFor="s-to">To time</FieldLabel><NativeSelect id="s-to" value={form.endMin} onChange={(event) => update({ endMin: event.target.value })} options={TIMES} /></Field></div>}
            <Field><FieldLabel htmlFor="s-title">Announcement title</FieldLabel><Input id="s-title" value={form.title} required minLength={3} maxLength={120} onChange={(event) => update({ title: event.target.value })} placeholder={virtual ? "Virtual classes during campus maintenance" : "Class suspension due to severe weather"} /></Field>
            <Field><FieldLabel htmlFor="s-reason">Reason</FieldLabel><Textarea id="s-reason" value={form.reason} required minLength={3} maxLength={300} onChange={(event) => update({ reason: event.target.value })} placeholder="Explain the change for affected faculty and students." /></Field>
            {virtual && <div className="space-y-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"><Field><FieldLabel htmlFor="s-link">Meeting link <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="s-link" type="url" value={form.meetingLink} onChange={(event) => update({ meetingLink: event.target.value })} placeholder="https://meet.google.com/…" /><p className="text-xs text-muted-foreground">Use a shared link only if it applies to every selected class.</p></Field><Field><FieldLabel htmlFor="s-instructions">Joining instructions <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Textarea id="s-instructions" value={form.instructions} maxLength={500} onChange={(event) => update({ instructions: event.target.value })} placeholder="Where students should find the lesson or class-specific meeting links." /></Field></div>}
          </CardContent></Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start"><Card className="ring-primary/20"><CardHeader><CardTitle>Review your plan</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-3 rounded-lg bg-primary/5 p-3">{virtual ? <VideoCamera className="size-6 text-primary" /> : <Prohibit className="size-6 text-primary" />}<div><p className="text-sm font-semibold">{virtual ? "Virtual delivery" : "Class suspension"}</p><p className="text-xs text-muted-foreground">{levelLabel(props.level)}</p></div></div><dl className="space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">Affected scope</dt><dd className="mt-1 font-medium">{form.target === "SCHOOL" ? "All academic levels" : form.target === "LEVEL" ? "Whole academic level" : `${form.selected.length} ${form.target.toLowerCase()} selected`}</dd></div><div><dt className="text-xs text-muted-foreground">Dates</dt><dd className="mt-1 flex items-center gap-2"><CalendarBlank className="size-4 text-muted-foreground" />{form.start === form.end ? form.start : `${form.start} → ${form.end}`}</dd></div><div><dt className="text-xs text-muted-foreground">Time window</dt><dd className="mt-1">{form.allDay ? "Whole day" : formatRange(Number(form.startMin), Number(form.endMin))}</dd></div></dl><p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">{virtual ? "Classes keep their original times and faculty. Only physical attendance changes; make-up classes are not required." : "Selected meetings will be cancelled. You can arrange make-up sessions or lift the order later."}</p><Button type="submit" className="w-full" disabled={pending || (!broad && !form.selected.length)}>{pending ? <CircleNotch className="size-4 animate-spin" /> : <Eye className="size-4" />}Preview affected classes</Button><p className="text-[11px] text-muted-foreground">Previewing saves nothing. Confirmation is required before any change takes effect.</p></CardContent></Card><div className="rounded-xl border bg-card p-4"><p className="text-sm font-semibold">Choosing an option</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Virtual classes: teaching continues. Suspend: lessons cannot proceed.</p></div></aside>
      </fieldset>
    </form>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}

    {preview && <Card className="ring-primary/30"><CardHeader><CardTitle>Review the impact before confirming</CardTitle><p className="text-sm text-muted-foreground">{preview.items.length} dated meetings will {virtual ? "continue virtually" : "be suspended"}. Faculty and students receive a notification after confirmation.</p></CardHeader><CardContent className="space-y-4">{[...preview.blockers, ...preview.notes].map((note) => <p key={note} className="rounded-lg bg-muted/60 p-3 text-xs">{note}</p>)}<ChangeList items={preview.items} empty="No published classes meet during this period. Choose another date or selection." /><label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending} />I reviewed the affected meetings and am ready to notify the faculty and students.</label><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setPreview(null); setConfirmed(false); }} disabled={pending}>Back to editing</Button><Button type="button" variant={virtual ? "default" : "destructive"} onClick={apply} disabled={pending || !confirmed || preview.blockers.length > 0 || !preview.items.length}>{pending ? <CircleNotch className="size-4 animate-spin" /> : virtual ? <VideoCamera className="size-4" /> : <Prohibit className="size-4" />}{virtual ? "Confirm virtual classes" : "Confirm suspension"}</Button></div></CardContent></Card>}

    {applied && <Card className="ring-emerald-600/30"><CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><CheckCircle className="size-5 text-emerald-600" />{applied.mode === "VIRTUAL" ? "Virtual classes are arranged" : "Classes are suspended"}</CardTitle><LiftButton id={applied.id} mode={applied.mode} onDone={() => setApplied(null)} /></CardHeader><CardContent><ChangeList items={applied.plan.items} extra={applied.mode === "SUSPEND" ? (item) => item.kind === "CANCELLED" && <MakeUpPicker batchId={applied.batchId} item={item} /> : undefined} /></CardContent></Card>}

    <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Class arrangements & history</CardTitle><p className="mt-1 text-xs text-muted-foreground">Suspensions and virtual classes for the scope you handle.</p></div><NativeSelect aria-label="Filter class arrangements" value={history} onChange={(event) => setHistory(event.target.value)} options={[{ value: "ACTIVE", label: "Active arrangements" }, { value: "ALL", label: "All history" }, { value: "LIFTED", label: "Lifted arrangements" }]} /></CardHeader><CardContent className="space-y-3">{props.orders.filter((order) => history === "ALL" || order.status === history).map((order) => <div key={order.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"><div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{order.mode === "VIRTUAL" ? "Virtual classes" : "Suspension"}</Badge><Badge variant="outline">{order.status === "ACTIVE" ? "Active" : "Lifted"}</Badge></div><p className="font-semibold">{order.title}</p><p className="text-xs text-muted-foreground">{order.start === order.end ? order.start : `${order.start} to ${order.end}`} · {order.startMin !== null && order.endMin !== null ? formatRange(order.startMin, order.endMin) : "Whole day"} · {order.sections} sections · {order.meetings} classes</p><p className="text-sm">{order.reason}</p><p className="text-xs text-muted-foreground">Issued by {order.issuedBy}{order.liftedBy ? ` · Lifted by ${order.liftedBy}` : ""}</p>{order.mode === "VIRTUAL" && order.meetingLink?.startsWith("https://") && <a href={order.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4"><VideoCamera className="size-4" />Open shared meeting</a>}</div>{order.canLift && <LiftButton id={order.id} mode={order.mode} />}</div>)}{!props.orders.some((order) => history === "ALL" || order.status === history) && <div className="rounded-xl border border-dashed p-8 text-center"><CalendarBlank className="mx-auto mb-2 size-7 text-muted-foreground" /><p className="text-sm font-medium">No matching class arrangements</p><p className="mt-1 text-xs text-muted-foreground">Confirmed suspensions and virtual classes.</p></div>}</CardContent></Card>
  </div>;
}

function LiftButton({ id, mode, onDone }: { id: string; mode: DeliveryMode; onDone?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
    const result = await liftSuspensionAction(id);
    if (!result.ok) return void toast.error(result.error, { duration: 10000 });
    toast.success("Original class arrangements restored. Affected faculty and students were notified."); onDone?.(); router.refresh();
  })}>{pending ? <CircleNotch className="size-4 animate-spin" /> : <ArrowCounterClockwise className="size-4" />}{mode === "VIRTUAL" ? "Restore in-person classes" : "Lift suspension"}</Button>;
}
