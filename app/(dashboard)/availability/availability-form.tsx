"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleNotch, Eye, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState } from "@/components/ux/states";
import { DEFAULT_GRID, formatRange, timeOptions } from "@/lib/scheduler/timetable";
import { previewMyUnavailabilityAction, reportUnavailabilityAction, withdrawReportAction, type ImpactItem } from "./actions";

export interface ReportRow {
  id: string;
  start: string;
  end: string;
  startMin: number | null;
  endMin: number | null;
  reason: string;
  status: string;
  own: boolean;
}

const TIMES = timeOptions({ ...DEFAULT_GRID, dayEnd: 21 * 60 }).map((t) => ({ value: String(t.value), label: t.label }));
const STATUS: Record<string, { label: string; variant: "secondary" | "default" | "outline" }> = {
  PENDING: { label: "Waiting for review", variant: "secondary" },
  APPLIED: { label: "Classes adjusted", variant: "default" },
  DISMISSED: { label: "Dismissed", variant: "outline" },
};

export function AvailabilityForm({ reports, linked }: { reports: ReportRow[]; linked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = new Date().toLocaleDateString("en-CA");
  const [form, setForm] = useState({ start: today, end: today, startMin: "", endMin: "", reason: "" });
  const [impact, setImpact] = useState<{ items: ImpactItem[]; hours: number; loadNote: string } | null>(null);
  const edit = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setImpact(null);
  };
  const input = () => ({ start: form.start, end: form.end, reason: form.reason || "Preview", startMin: form.startMin ? Number(form.startMin) : null, endMin: form.endMin ? Number(form.endMin) : null });

  function preview() {
    startTransition(async () => {
      const res = await previewMyUnavailabilityAction(input());
      if (res.ok) setImpact(res.data);
      else toast.error(res.error);
    });
  }

  if (!linked) {
    return <EmptyState title="Account not linked to a faculty record" description="Ask the Administrator to link your account in User Management so you can report unavailability." />;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await reportUnavailabilityAction({ ...input(), reason: form.reason });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Reported. Your Head of Department and the Administrator were notified.");
      // Show right away how the report affects this faculty member's classes.
      const effect = await previewMyUnavailabilityAction(input());
      if (effect.ok) setImpact(effect.data);
      setForm((f) => ({ ...f, reason: "" }));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">New report</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="u-start">From date</FieldLabel>
              <Input id="u-start" type="date" min={today} value={form.start} onChange={(e) => edit({ start: e.target.value, end: e.target.value > form.end ? e.target.value : form.end })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-end">To date</FieldLabel>
              <Input id="u-end" type="date" min={form.start} value={form.end} onChange={(e) => edit({ end: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-from">From time</FieldLabel>
              <NativeSelect id="u-from" value={form.startMin} onChange={(e) => edit({ startMin: e.target.value })} options={TIMES} placeholder="Whole day" />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-to">To time</FieldLabel>
              <NativeSelect id="u-to" value={form.endMin} onChange={(e) => edit({ endMin: e.target.value })} options={TIMES} placeholder="Whole day" />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="u-reason">Reason</FieldLabel>
              <Input id="u-reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Seminar, medical appointment, official travel" required minLength={3} />
            </Field>
            <Button type="button" variant="outline" disabled={pending} onClick={preview}>
              <Eye className="size-4" /> See how this affects me
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <CircleNotch className="size-4 animate-spin" /> : <PaperPlaneTilt className="size-4" />} Submit report
            </Button>
          </form>
          {impact && (
            <div className="mt-4 space-y-2 rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
              <p className="font-medium">
                {impact.items.length === 0 ? "None of your classes meet during this time." : `${impact.items.length} class meeting(s), ${impact.hours} hours, would be affected.`}
              </p>
              <p className="text-xs text-muted-foreground">{impact.loadNote}</p>
              <ul className="space-y-1.5">
                {impact.items.map((i, n) => (
                  <li key={n} className="rounded-md border bg-card p-2 text-xs">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {i.label}
                      <Badge variant={i.outcome === "MAKE_UP" ? "destructive" : "secondary"}>{i.outcome === "COVERED" ? "Covered" : i.outcome === "MOVED" ? "Moved" : "Make-up needed"}</Badge>
                    </p>
                    <p className="text-muted-foreground">{i.date}, {i.time}, {i.room}. {i.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">My reports</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {reports.length === 0 && <p className="text-sm text-muted-foreground">You have not reported any unavailability.</p>}
          {reports.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.start === r.end ? r.start : `${r.start} to ${r.end}`}
                  <span className="font-normal text-muted-foreground">{r.startMin !== null && r.endMin !== null ? `, ${formatRange(r.startMin, r.endMin)}` : ", whole day"}</span>
                </p>
                <p className="text-xs text-muted-foreground">{r.reason}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                {r.own && r.status === "PENDING" && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => {
                    const res = await withdrawReportAction(r.id);
                    if (res.ok) { toast.success("Report withdrawn."); router.refresh(); } else toast.error(res.error);
                  })}>
                    Withdraw
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
