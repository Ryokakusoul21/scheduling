"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SlidersHorizontal } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { loadTimetableConfigurationAction, previewTimetableConfigurationAction, saveTimetableConfigurationAction } from "@/app/(dashboard)/scheduler/configuration-actions";
import { DEFAULT_TIMETABLE, TIMETABLE_DAYS, timeInputValue, timeInputMinutes, type TimetableConfig } from "@/lib/timetable/config";
import { DAY_LONG } from "@/lib/scheduler/timetable";

type Preview = Extract<Awaited<ReturnType<typeof previewTimetableConfigurationAction>>, { ok: true }>;
export function TimetableConfiguration({ terms, departments, canManageSchool, termId, departmentId }: {
  terms: { id: string; label: string; programId?: string | null }[]; departments: { id: string; name: string }[];
  canManageSchool: boolean; termId?: string; departmentId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState({ departmentId: canManageSchool ? "" : departments[0]?.id ?? "", termId: terms[0]?.id ?? "" });
  const [config, setConfig] = useState<TimetableConfig>(DEFAULT_TIMETABLE);
  const [loaded, setLoaded] = useState(false);
  const [inherit, setInherit] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const request = { departmentId: choice.departmentId || null, termId: choice.termId || null, config, inherit };
  const set = <K extends keyof TimetableConfig>(key: K, value: TimetableConfig[K]) => { setConfig((c) => ({ ...c, [key]: value })); setPreview(null); setError(""); };
  function load(next: typeof choice) {
    setChoice(next); setLoaded(false); setPreview(null); setError("");
    startTransition(async () => {
      const result = await loadTimetableConfigurationAction({ departmentId: next.departmentId || null, termId: next.termId || null });
      if (!result.ok) { setError(result.error); return; }
      setConfig({ ...DEFAULT_TIMETABLE, ...result.config }); setInherit(result.inherited && result.canInherit); setLoaded(true);
    });
  }
  function launch() {
    setOpen(true);
    load({ departmentId: departmentId || (canManageSchool ? "" : departments[0]?.id ?? ""), termId: terms.some((t) => t.id === termId) ? termId! : terms[0]?.id ?? "" });
  }
  function check() {
    startTransition(async () => { const result = await previewTimetableConfigurationAction(request); if (result.ok) { setPreview(result); setError(""); } else { setPreview(null); setError(result.error); } });
  }
  function save() {
    if (!preview) return;
    startTransition(async () => { const result = await saveTimetableConfigurationAction({ ...request, token: preview.token });
      if (!result.ok) { setError(result.error); setPreview(null); return; }
      toast.success("Timetable configuration saved", { description: "Existing class and examination times were preserved." }); setOpen(false); router.refresh();
    });
  }
  const timeField = (id: string, value: number, onChange: (v: number) => void) => <Input id={id} type="time" step={60} value={timeInputValue(value)} onChange={(e) => { if (e.target.value) onChange(timeInputMinutes(e.target.value)); }} />;
  return <><Button variant="ghost" size="icon-sm" onClick={launch} aria-label="Timetable Configuration" title="Timetable Configuration"><SlidersHorizontal className="size-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-2xl">
      <DialogHeader><DialogTitle className="font-bold">Timetable Configuration</DialogTitle><DialogDescription>Set fixed slots or flexible times for classes and examinations. Preview the impact before saving.</DialogDescription></DialogHeader>
      <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">Scope<NativeSelect aria-label="Configuration scope" value={choice.departmentId} onChange={(e) => load({ departmentId: e.target.value, termId: choice.termId || terms[0]?.id || "" })} options={[...(canManageSchool ? [{ value: "", label: "School-wide" }] : []), ...departments.map((d) => ({ value: d.id, label: d.name }))]} /></label>
        <label className="grid gap-1">Academic term<NativeSelect aria-label="Configuration term" value={choice.termId} onChange={(e) => load({ ...choice, termId: e.target.value })} options={[...(!choice.departmentId && canManageSchool ? [{ value: "", label: "School default · all terms" }] : []), ...terms.map((t) => ({ value: t.id, label: t.label }))]} /></label>
      </fieldset>
      {!loaded && !error && <p role="status">Loading configuration…</p>}
      {loaded && <>
        {!!choice.termId && <p className="text-xs text-muted-foreground">Settings must fit the school's enabled days and hours.</p>}
        {!!choice.termId && <label className="flex items-center gap-2"><input type="checkbox" checked={inherit} disabled={pending} onChange={(e) => { setInherit(e.target.checked); setPreview(null); }} /> Use inherited school settings</label>}
        <fieldset disabled={pending || inherit} className="grid gap-4 disabled:opacity-60">
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <label className="grid gap-1 font-semibold">Default class meeting length<NativeSelect aria-label="Default class meeting length" value={config.classSession} onChange={(e) => set("classSession", e.target.value as TimetableConfig["classSession"])} options={[{ value: "DEFAULT", label: "By level and component (current default)" }, { value: "SPLIT_90", label: "1.5 hours · split meetings" }, { value: "BLOCK_180", label: "3 hours · one continuous block" }]} /></label>
            <p className="text-xs text-muted-foreground">For example, 3 hours: two 1.5-hour meetings or one 3-hour block.</p>
            <p className="text-xs text-muted-foreground">Applies to new class meetings. Existing schedules and examination durations stay unchanged.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">Time mode<NativeSelect aria-label="Time mode" value={config.mode} onChange={(e) => set("mode", e.target.value as TimetableConfig["mode"])} options={[{ value: "STATIC", label: "Static · fixed time slots" }, { value: "DYNAMIC", label: "Dynamic · flexible times" }]} /></label>
            <label className="grid gap-1">Grid row interval<NativeSelect aria-label="Grid row interval" value={String(config.gridInterval)} onChange={(e) => set("gridInterval", Number(e.target.value) as TimetableConfig["gridInterval"])} options={[15, 30, 60].map((n) => ({ value: String(n), label: `${n} minutes` }))} /></label>
            <label className="grid gap-1">Opening time{timeField("tt-open", config.dayStart, (v) => set("dayStart", v))}</label>
            <label className="grid gap-1">Closing time{timeField("tt-close", config.dayEnd, (v) => set("dayEnd", v))}</label>
            <label className="grid gap-1">Flexible adjustment step<NativeSelect aria-label="Flexible adjustment step" disabled={config.mode === "STATIC"} value={String(config.adjustmentStep)} onChange={(e) => set("adjustmentStep", Number(e.target.value) as TimetableConfig["adjustmentStep"])} options={[5, 10, 15, 30].map((n) => ({ value: String(n), label: `${n} minutes` }))} /></label>
            <label className="grid gap-1">Row size<NativeSelect aria-label="Row size" value={config.zoom} onChange={(e) => set("zoom", e.target.value as TimetableConfig["zoom"])} options={[{ value: "COMPACT", label: "Compact" }, { value: "STANDARD", label: "Standard" }, { value: "LARGE", label: "Large" }]} /></label>
          </div>
          <p className="text-xs text-muted-foreground">Static follows the grid interval; dynamic uses the adjustment step.</p>
          <div className="space-y-2"><p className="font-semibold">Teaching days</p><div className="flex flex-wrap gap-x-4 gap-y-2">{TIMETABLE_DAYS.map((day) => <label key={day} className="flex items-center gap-1.5"><input type="checkbox" checked={config.days.includes(day)} onChange={(e) => set("days", e.target.checked ? [...config.days, day] : config.days.filter((d) => d !== day))} />{DAY_LONG[day]}</label>)}</div></div>
          <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input type="checkbox" checked={config.hour12} onChange={(e) => set("hour12", e.target.checked)} />12-hour labels</label><label className="flex items-center gap-2"><input type="checkbox" checked={config.autoFit} onChange={(e) => set("autoFit", e.target.checked)} />Fit visible hours to classes</label></div>
          <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">Hours by day</summary><div className="mt-3 space-y-3">{config.days.map((day) => <div key={day} className="grid gap-2 sm:grid-cols-[1fr_120px_120px] items-center"><label className="flex items-center gap-2"><input type="checkbox" checked={!!config.dayHours[day]} onChange={(e) => { const hours = { ...config.dayHours }; if (e.target.checked) hours[day] = { startMin: config.dayStart, endMin: config.dayEnd }; else delete hours[day]; set("dayHours", hours); }} />{DAY_LONG[day]}</label>{config.dayHours[day] && <>{timeField(`tt-${day}-open`, config.dayHours[day]!.startMin, (v) => set("dayHours", { ...config.dayHours, [day]: { ...config.dayHours[day]!, startMin: v } }))}{timeField(`tt-${day}-close`, config.dayHours[day]!.endMin, (v) => set("dayHours", { ...config.dayHours, [day]: { ...config.dayHours[day]!, endMin: v } }))}</>}</div>)}</div></details>
          <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">Breaks ({config.breaks.length})</summary><div className="mt-3 space-y-3">{config.breaks.map((b, i) => { const update = (next: typeof b) => set("breaks", config.breaks.map((item, j) => i === j ? next : item)); return <div key={i} className="space-y-2 rounded border p-2"><Input aria-label={`Break ${i + 1} name`} value={b.name} onChange={(e) => update({ ...b, name: e.target.value })} /><div className="grid grid-cols-2 gap-2">{timeField(`break-${i}-start`, b.startMin, (v) => update({ ...b, startMin: v }))}{timeField(`break-${i}-end`, b.endMin, (v) => update({ ...b, endMin: v }))}</div><div className="flex flex-wrap gap-2">{TIMETABLE_DAYS.map((d) => <label key={d} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={b.days.includes(d)} onChange={(e) => update({ ...b, days: e.target.checked ? [...b.days, d] : b.days.filter((v) => v !== d) })} />{DAY_LONG[d].slice(0, 3)}</label>)}</div><Button variant="ghost" size="sm" onClick={() => set("breaks", config.breaks.filter((_, j) => j !== i))}>Remove break</Button></div>; })}<Button variant="outline" size="sm" disabled={config.breaks.length >= 12} onClick={() => set("breaks", [...config.breaks, { name: "Lunch", days: [...config.days], startMin: 720, endMin: 780 }])}>Add break</Button><p className="text-xs text-muted-foreground">School breaks remain in force for department configurations.</p></div></details>
        </fieldset>
      </>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {preview && <div role="status" className="rounded-lg border bg-muted/40 p-3 space-y-2"><p className="font-semibold">{preview.affected ? `${preview.affected} meeting${preview.affected === 1 ? " needs" : "s need"} review` : "All existing meetings fit"}</p><p className="text-xs text-muted-foreground">Checked {preview.checked} classes and examinations. Existing times will be preserved.</p>{preview.issues.length > 0 && <ul className="max-h-40 overflow-auto space-y-2 text-xs">{preview.issues.map((issue) => <li key={`${issue.kind}-${issue.id}`}><b>{issue.kind} · {issue.section}</b> — {issue.reason}</li>)}</ul>}{preview.affected > 50 && <p className="text-xs">Showing the first 50 affected meetings.</p>}</div>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button variant="outline" onClick={check} disabled={pending || !loaded}>Preview impact</Button><Button onClick={save} disabled={pending || !preview}>{pending ? "Working…" : "Save configuration"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
