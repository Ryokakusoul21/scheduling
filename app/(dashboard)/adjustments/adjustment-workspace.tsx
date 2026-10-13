"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, CircleNotch, Eye, Lightning } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ux/native-select";
import { ActionButton } from "@/components/ux/action-button";
import { ChangeList } from "@/components/scheduler/change-list";
import { DEFAULT_GRID, formatRange, timeOptions } from "@/lib/scheduler/timetable";
import type { AdjustmentPlan, Placement, PlanItem } from "@/lib/occupancy/adjust";
import { cn } from "@/lib/utils";
import {
  applyAdjustmentAction,
  dismissReportAction,
  makeUpOptionsAction,
  previewAdjustmentAction,
  scheduleMakeUpAction,
  undoAdjustmentAction,
  type AdjustmentRequest,
} from "./actions";

type Option = { value: string; label: string };
type Kind = AdjustmentRequest["kind"];

export interface ReportView {
  id: string;
  facultyId: string;
  facultyName: string;
  start: string;
  end: string;
  startMin: number | null;
  endMin: number | null;
  reason: string;
}

export interface BatchView {
  id: string;
  cause: string;
  summary: string;
  createdAt: string;
  undone: boolean;
  items: (PlanItem & { makeUpScheduled: boolean })[];
}

const KINDS: { value: Kind; label: string; help: string }[] = [
  { value: "FACULTY", label: "Faculty unavailable", help: "Each class gets a qualified substitute who is free, preferring the same department; otherwise it is cancelled for a make-up class." },
  { value: "ROOM", label: "Room unavailable", help: "Each class moves to the nearest suitable free room, or the nearest free time that day; otherwise it is cancelled for a make-up class." },
  { value: "SUSPENSION", label: "Class suspension", help: "Classes on the chosen days (all sections or specific sections) are cancelled, and make-up class options are offered." },
];
const TIMES = timeOptions({ ...DEFAULT_GRID, dayEnd: 21 * 60 }).map((t) => ({ value: String(t.value), label: t.label }));
const today = () => new Date().toLocaleDateString("en-CA");

interface FormState {
  kind: Kind;
  facultyId: string;
  roomId: string;
  sectionIds: string[];
  title: string;
  start: string;
  end: string;
  startMin: string;
  endMin: string;
  reason: string;
  reportId?: string;
}

export function AdjustmentWorkspace(props: {
  faculty: Option[];
  rooms: Option[];
  sections: Option[];
  canSuspendAll: boolean;
  reports: ReportView[];
  batches: BatchView[];
  initialReportId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fromReport = (r: ReportView): FormState => ({
    kind: "FACULTY", facultyId: r.facultyId, roomId: "", sectionIds: [], title: "", start: r.start, end: r.end,
    startMin: r.startMin?.toString() ?? "", endMin: r.endMin?.toString() ?? "", reason: r.reason, reportId: r.id,
  });
  const initial = props.reports.find((r) => r.id === props.initialReportId);
  const [form, setForm] = useState<FormState>(
    initial ? fromReport(initial) : { kind: "FACULTY", facultyId: "", roomId: "", sectionIds: [], title: "", start: today(), end: today(), startMin: "", endMin: "", reason: "" }
  );
  const [preview, setPreview] = useState<AdjustmentPlan | null>(null);
  const [applied, setApplied] = useState<{ batchId: string; plan: AdjustmentPlan } | null>(null);
  const [sectionQuery, setSectionQuery] = useState("");

  const update = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setPreview(null);
  };
  const request = (): AdjustmentRequest => {
    const common = { start: form.start, end: form.end, startMin: form.startMin ? Number(form.startMin) : null, endMin: form.endMin ? Number(form.endMin) : null, reason: form.reason };
    if (form.kind === "FACULTY") return { kind: "FACULTY", facultyId: form.facultyId, reportId: form.reportId, ...common };
    if (form.kind === "ROOM") return { kind: "ROOM", roomId: form.roomId, ...common };
    return { kind: "SUSPENSION", sectionIds: form.sectionIds, title: form.title, ...common };
  };

  function runPreview(e: React.FormEvent) {
    e.preventDefault();
    setApplied(null);
    startTransition(async () => {
      const res = await previewAdjustmentAction(request());
      if (res.ok) setPreview(res.data);
      else toast.error(res.error);
    });
  }

  function apply() {
    startTransition(async () => {
      const res = await applyAdjustmentAction(request());
      if (!res.ok) return void toast.error(res.error);
      setApplied(res.data);
      setPreview(null);
      toast.success(`${res.data.plan.items.length} class meeting(s) adjusted; everyone affected was notified.`);
      router.refresh();
    });
  }

  const visibleSections = useMemo(
    () => props.sections.filter((s) => s.label.toLowerCase().includes(sectionQuery.toLowerCase())),
    [props.sections, sectionQuery]
  );
  const kind = KINDS.find((k) => k.value === form.kind)!;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">New adjustment</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={runPreview} className="space-y-3">
              <div className="flex flex-wrap gap-1 rounded-md border p-0.5" role="tablist" aria-label="Adjustment type">
                {KINDS.map((k) => (
                  <button type="button" role="tab" aria-selected={form.kind === k.value} key={k.value} onClick={() => update({ kind: k.value, reportId: undefined })} className={cn("rounded px-3 py-1.5 text-xs font-medium", form.kind === k.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                    {k.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{kind.help}</p>
              {form.reportId && <Badge variant="secondary">Reviewing a reported unavailability</Badge>}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {form.kind === "FACULTY" && (
                  <Field className="lg:col-span-2">
                    <FieldLabel htmlFor="j-faculty">Faculty member</FieldLabel>
                    <NativeSelect id="j-faculty" value={form.facultyId} onChange={(e) => update({ facultyId: e.target.value })} options={props.faculty} placeholder="Choose a faculty member" />
                  </Field>
                )}
                {form.kind === "ROOM" && (
                  <Field className="lg:col-span-2">
                    <FieldLabel htmlFor="j-room">Room</FieldLabel>
                    <NativeSelect id="j-room" value={form.roomId} onChange={(e) => update({ roomId: e.target.value })} options={props.rooms} placeholder="Choose a room" />
                  </Field>
                )}
                {form.kind === "SUSPENSION" && (
                  <Field className="lg:col-span-2">
                    <FieldLabel htmlFor="j-title">Suspension title</FieldLabel>
                    <Input id="j-title" value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="Typhoon class suspension" />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="j-start">From date</FieldLabel>
                  <Input id="j-start" type="date" value={form.start} onChange={(e) => update({ start: e.target.value, end: e.target.value > form.end ? e.target.value : form.end })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="j-end">To date</FieldLabel>
                  <Input id="j-end" type="date" value={form.end} min={form.start} onChange={(e) => update({ end: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="j-from">From time</FieldLabel>
                  <NativeSelect id="j-from" value={form.startMin} onChange={(e) => update({ startMin: e.target.value })} options={TIMES} placeholder="Whole day" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="j-to">To time</FieldLabel>
                  <NativeSelect id="j-to" value={form.endMin} onChange={(e) => update({ endMin: e.target.value })} options={TIMES} placeholder="Whole day" />
                </Field>
                <Field className="lg:col-span-2">
                  <FieldLabel htmlFor="j-reason">Reason</FieldLabel>
                  <Input id="j-reason" value={form.reason} onChange={(e) => update({ reason: e.target.value })} placeholder="Medical leave, maintenance, weather advisory" />
                </Field>
              </div>

              {form.kind === "SUSPENSION" && (
                <fieldset className="space-y-2 rounded-lg border p-3">
                  <legend className="px-1 text-sm font-medium">Sections</legend>
                  <div className="flex flex-wrap items-center gap-2">
                    {props.canSuspendAll && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4 accent-primary" checked={form.sectionIds.length === 0} onChange={() => update({ sectionIds: [] })} />
                        All sections
                      </label>
                    )}
                    <Input placeholder="Search sections" value={sectionQuery} onChange={(e) => setSectionQuery(e.target.value)} className="h-8 max-w-60" />
                    <span className="text-xs text-muted-foreground">{form.sectionIds.length ? `${form.sectionIds.length} selected` : props.canSuspendAll ? "Every section" : "None selected"}</span>
                  </div>
                  <div className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                    {visibleSections.map((s) => (
                      <label key={s.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={form.sectionIds.includes(s.value)}
                          onChange={(e) => update({ sectionIds: e.target.checked ? [...form.sectionIds, s.value] : form.sectionIds.filter((x) => x !== s.value) })}
                        />
                        <span className="truncate">{s.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <Button type="submit" variant="outline" disabled={pending}>
                {pending ? <CircleNotch className="size-4 animate-spin" /> : <Eye className="size-4" />} Preview affected classes
              </Button>
            </form>
          </CardContent>
        </Card>

        {preview && (
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Before and after: {preview.items.length} class meeting(s)</CardTitle>
              <Button onClick={apply} disabled={pending || preview.blockers.length > 0 || preview.items.length === 0}>
                <Lightning className="size-4" /> Apply and notify
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...preview.blockers, ...preview.notes].map((n) => <p key={n} className="text-sm text-amber-700 dark:text-amber-400">{n}</p>)}
              <ChangeList items={preview.items} empty="No classes meet during this period." />
            </CardContent>
          </Card>
        )}

        {applied && (
          <Card className="border-emerald-500/40">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Applied. Everyone affected was notified.</CardTitle>
              <UndoButton batchId={applied.batchId} onDone={() => setApplied(null)} />
            </CardHeader>
            <CardContent>
              <ChangeList items={applied.plan.items} extra={(i) => i.kind === "CANCELLED" && <MakeUpPicker batchId={applied.batchId} item={i} />} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Recent adjustments</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {props.batches.length === 0 && <p className="text-sm text-muted-foreground">No adjustments in the last 60 days.</p>}
            {props.batches.map((b) => (
              <details key={b.id} className={cn("rounded-lg border p-3", b.undone && "opacity-60")}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">{b.cause}</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">{b.summary}</span>
                  <span className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString("en-PH")} · {b.items.length} change(s)</span>
                  {b.undone && <Badge variant="outline">Undone</Badge>}
                </summary>
                <div className="mt-3 space-y-2">
                  {!b.undone && <UndoButton batchId={b.id} />}
                  <ChangeList items={b.items} extra={(i) => !b.undone && i.kind === "CANCELLED" && !i.makeUpScheduled && <MakeUpPicker batchId={b.id} item={i} />} />
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">Reported unavailability</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {props.reports.length === 0 && <p className="text-sm text-muted-foreground">No pending reports.</p>}
          {props.reports.map((r) => (
            <div key={r.id} className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">{r.facultyName}</p>
              <p className="text-xs text-muted-foreground">
                {r.start === r.end ? r.start : `${r.start} to ${r.end}`}
                {r.startMin !== null && r.endMin !== null ? `, ${formatRange(r.startMin, r.endMin)}` : ", whole day"}
              </p>
              <p className="text-xs">{r.reason}</p>
              <div className="flex gap-2">
                <ActionButton kind="view" onClick={() => { setForm(fromReport(r)); setPreview(null); setApplied(null); }}>Review</ActionButton>
                <ActionButton
                  kind="dismiss"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const res = await dismissReportAction(r.id);
                    if (res.ok) { toast.success("Report dismissed."); router.refresh(); } else toast.error(res.error);
                  })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function UndoButton({ batchId, onDone }: { batchId: string; onDone?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const res = await undoAdjustmentAction(batchId);
        if (!res.ok) return void toast.error(res.error, { duration: 10000 });
        toast.success("Undone. Classes are back in their original slots and faculty were notified.");
        onDone?.();
        router.refresh();
      })}
    >
      {pending ? <CircleNotch className="size-4 animate-spin" /> : <ArrowCounterClockwise className="size-4" />} Undo
    </Button>
  );
}

function MakeUpPicker({ batchId, item }: { batchId: string; item: PlanItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState<(Placement & { reason: string })[] | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="text-xs text-emerald-600">Make-up class set: {done}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!options && (
        <Button size="xs" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
          const res = await makeUpOptionsAction(batchId, item.scheduleId, item.before.date);
          if (res.ok) setOptions(res.data); else toast.error(res.error);
        })}>
          {pending && <CircleNotch className="size-3 animate-spin" />} Find make-up options
        </Button>
      )}
      {options?.length === 0 && <span className="text-xs text-muted-foreground">No free slot in the next two weeks.</span>}
      {options?.map((o) => {
        const text = `${o.date}, ${formatRange(o.startMin, o.endMin)}, ${o.roomName}`;
        return (
          <Button key={text} size="xs" variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
            const res = await scheduleMakeUpAction(batchId, item.scheduleId, item.before.date, { date: o.date, roomId: o.roomId, startMin: o.startMin, endMin: o.endMin });
            if (!res.ok) return void toast.error(res.error);
            setDone(text);
            toast.success("Make-up class scheduled and the faculty member notified.");
            router.refresh();
          })}>
            {text}
          </Button>
        );
      })}
    </div>
  );
}
