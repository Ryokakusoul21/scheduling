"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch, Copy, Trash, WarningOctagon, Warning, CheckCircle } from "@phosphor-icons/react/ssr";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ux/native-select";
import { detectConflicts, isOverlapConflict } from "@/lib/scheduler/conflictDetector";
import { DAY_LONG, WEEK_DAYS, formatTime, subjectAppliesToSection, timeOptions } from "@/lib/scheduler/timetable";
import type { DetectedConflict } from "@/lib/scheduler/types";
import { rankFaculty, rankRooms } from "@/lib/scheduler/suggest";
import type { ClassInput } from "@/app/(dashboard)/scheduler/actions";
import type { SchedulerData, SchedulerEntry, ScheduleStatus } from "./types";
import type { ConflictContextBuilder } from "./scheduler-workspace";

export interface ClassDraft {
  id?: string;
  semesterId: string;
  sectionId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  component: "LECTURE" | "LABORATORY";
  dayOfWeek: SchedulerEntry["dayOfWeek"];
  startMin: number;
  endMin: number;
  status?: ScheduleStatus;
  notes?: string;
}

const STATUS_OPTIONS: { value: ScheduleStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "REVIEW", label: "For review" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

export function ClassDialog({
  open,
  onOpenChange,
  draft,
  data,
  entries,
  buildContext,
  canPublish,
  directEdit,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ClassDraft | null;
  data: SchedulerData;
  entries: SchedulerEntry[];
  buildContext: ConflictContextBuilder;
  canPublish: boolean;
  directEdit: boolean;
  onSave: (input: ClassInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {draft && (
          <ClassForm
            // Remount per draft so the form resets cleanly.
            key={draft.id ?? `${draft.sectionId}-${draft.subjectId}-${draft.dayOfWeek}-${draft.startMin}`}
            draft={draft}
            data={data}
            entries={entries}
            buildContext={buildContext}
            canPublish={canPublish}
            directEdit={directEdit}
            onSave={onSave}
            onDelete={onDelete}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClassForm({
  draft,
  data,
  entries,
  buildContext,
  canPublish,
  directEdit,
  onSave,
  onDelete,
  onClose,
}: {
  draft: ClassDraft;
  data: SchedulerData;
  entries: SchedulerEntry[];
  buildContext: ConflictContextBuilder;
  canPublish: boolean;
  directEdit: boolean;
  onSave: (input: ClassInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ClassDraft>(draft);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ClassDraft>(k: K, v: ClassDraft[K]) => setForm((f) => ({ ...f, [k]: v }));

  const section = data.sections.find((s) => s.id === form.sectionId);
  const subject = data.subjects.find((s) => s.id === form.subjectId);
  const term = data.terms.find((t) => t.id === form.semesterId);

  const termOptions = data.terms
    .filter((t) => !section || (t.level === section.level && (!t.programId || t.programId === section.programId)))
    .map((t) => ({ value: t.id, label: t.label }));

  const subjectOptions = data.subjects
    .filter((s) => !section || subjectAppliesToSection(s, section))
    .map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));

  // Entries in terms that run at the same time as this one (for busy/conflict checks).
  const concurrent = useMemo(() => {
    if (!term) return entries;
    const ids = new Set(data.terms.filter((t) => t.start <= term.end && term.start <= t.end).map((t) => t.id));
    return entries.filter((e) => ids.has(e.semesterId) && e.id !== form.id);
  }, [entries, data.terms, term, form.id]);

  const slot = { dayOfWeek: form.dayOfWeek, startMin: form.startMin, endMin: form.endMin };

  const facultyOptions = useMemo(() => {
    const pool = data.faculty.filter((f) => f.status === "ACTIVE" || f.id === form.facultyId);
    const byId = new Map(pool.map((f) => [f.id, f]));
    return rankFaculty(pool, slot, concurrent, section?.level).map((r) => {
      const name = byId.get(r.id)!.fullName;
      return { value: r.id, label: r.notes.length ? `${name} — ${r.notes.join(", ")}` : `${name} ✓` };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slot fields listed individually
  }, [data.faculty, section?.level, form.facultyId, concurrent, slot.dayOfWeek, slot.startMin, slot.endMin]);

  const roomOptions = useMemo(() => {
    const byId = new Map(data.rooms.map((r) => [r.id, r]));
    return rankRooms(data.rooms, slot, concurrent, {
      studentCount: section?.studentCount,
      component: form.component,
      requiredRoomType: subject?.requiredRoomType,
      programId: section?.programId,
    }).map((r) => {
      const room = byId.get(r.id)!;
      return {
        value: r.id,
        label: `${room.roomName} (${room.capacity}) · ${room.location}${r.notes.length ? ` — ${r.notes.join(", ")}` : " ✓"}`,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slot fields listed individually
  }, [data.rooms, section?.studentCount, subject?.requiredRoomType, form.component, concurrent, slot.dayOfWeek, slot.startMin, slot.endMin]);

  // Live conflict preview for the candidate placement.
  const preview: DetectedConflict[] = useMemo(() => {
    if (!form.sectionId || !form.subjectId || !form.facultyId || !form.roomId || !form.semesterId) return [];
    const candidate = { ...form, id: form.id ?? "__candidate__" };
    return detectConflicts([candidate, ...concurrent], buildContext()).filter(
      (c) => c.entryA.id === candidate.id || c.entryB?.id === candidate.id
    );
  }, [form, concurrent, buildContext]);
  const overlaps = preview.filter(isOverlapConflict);
  const warnings = preview.filter((c) => !isOverlapConflict(c));

  const times = timeOptions();
  const statusOptions = STATUS_OPTIONS.filter((o) => canPublish || o.value !== "PUBLISHED" || draft.status === "PUBLISHED");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.endMin <= form.startMin) {
      toast.error("End time must be after start time.");
      return;
    }
    startTransition(async () => {
      const ok = await onSave({ ...form, notes: form.notes ?? "" });
      if (ok) onClose();
    });
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{form.id ? "Edit class" : "Add class"}</DialogTitle>
        <DialogDescription>
          {directEdit
            ? "Changes are saved and applied immediately."
            : "Changes to published classes are sent for review before they go live."}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="cls-section">Section</FieldLabel>
          <NativeSelect
            id="cls-section"
            value={form.sectionId}
            onChange={(e) => set("sectionId", e.target.value)}
            placeholder="Select section"
            options={data.sections.map((s) => ({ value: s.id, label: s.name }))}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cls-term">Term</FieldLabel>
          <NativeSelect id="cls-term" value={form.semesterId} onChange={(e) => set("semesterId", e.target.value)} placeholder="Select term" options={termOptions} required />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="cls-subject">Subject</FieldLabel>
          <NativeSelect
            id="cls-subject"
            value={form.subjectId}
            onChange={(e) => {
              const s = data.subjects.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, subjectId: e.target.value, component: s && s.lectureHours === 0 && s.labHours > 0 ? "LABORATORY" : f.component }));
            }}
            placeholder={subjectOptions.length ? "Select subject" : "No subjects for this section's level/grade"}
            options={subjectOptions}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cls-component">Component</FieldLabel>
          <NativeSelect
            id="cls-component"
            value={form.component}
            onChange={(e) => set("component", e.target.value as ClassDraft["component"])}
            options={[
              { value: "LECTURE", label: "Lecture" },
              { value: "LABORATORY", label: "Laboratory" },
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cls-day">Day</FieldLabel>
          <NativeSelect
            id="cls-day"
            value={form.dayOfWeek}
            onChange={(e) => set("dayOfWeek", e.target.value as ClassDraft["dayOfWeek"])}
            options={WEEK_DAYS.map((d) => ({ value: d, label: DAY_LONG[d] }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cls-start">Start</FieldLabel>
          <NativeSelect
            id="cls-start"
            value={String(form.startMin)}
            onChange={(e) => {
              const start = Number(e.target.value);
              const duration = form.endMin - form.startMin;
              setForm((f) => ({ ...f, startMin: start, endMin: Math.min(start + Math.max(duration, 30), 24 * 60) }));
            }}
            options={times.slice(0, -1).map((t) => ({ value: String(t.value), label: t.label }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cls-end">End</FieldLabel>
          <NativeSelect
            id="cls-end"
            value={String(form.endMin)}
            onChange={(e) => set("endMin", Number(e.target.value))}
            options={times.filter((t) => t.value > form.startMin).map((t) => ({ value: String(t.value), label: t.label }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cls-faculty">Faculty</FieldLabel>
          <NativeSelect id="cls-faculty" value={form.facultyId} onChange={(e) => set("facultyId", e.target.value)} placeholder="Select faculty" options={facultyOptions} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="cls-room">Room</FieldLabel>
          <NativeSelect id="cls-room" value={form.roomId} onChange={(e) => set("roomId", e.target.value)} placeholder="Select room" options={roomOptions} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="cls-status">Status</FieldLabel>
          <NativeSelect
            id="cls-status"
            value={form.status ?? (directEdit ? "PUBLISHED" : "DRAFT")}
            onChange={(e) => set("status", e.target.value as ScheduleStatus)}
            options={statusOptions}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="cls-notes">Notes</FieldLabel>
          <Textarea id="cls-notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
        </Field>
      </FieldGroup>

      <div className="mt-4 space-y-2" aria-live="polite">
        {overlaps.map((c, i) => (
          <p key={`o${i}`} className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">
            <WarningOctagon className="mt-0.5 size-4 shrink-0" weight="fill" /> {c.description} ({describeOther(c, form.id ?? "__candidate__", data)})
          </p>
        ))}
        {warnings.map((c, i) => (
          <p key={`w${i}`} className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300">
            <Warning className="mt-0.5 size-4 shrink-0" weight="fill" /> {c.description}
          </p>
        ))}
        {preview.length === 0 && form.facultyId && form.roomId && (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle className="size-4" weight="fill" /> No conflicts for this time slot.
          </p>
        )}
      </div>

      <DialogFooter className="mt-6 flex-wrap gap-2 sm:justify-between">
        <div className="flex gap-2">
          {form.id && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setForm((f) => ({ ...f, id: undefined, status: undefined }))}
                title="Turn this form into a new copy of the class"
              >
                <Copy className="size-4" /> Duplicate
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    if (!window.confirm("Delete this class from the schedule?")) return;
                    if (await onDelete(form.id!)) onClose();
                  })
                }
              >
                <Trash className="size-4" /> Delete
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <CircleNotch className="size-4 animate-spin" />}
            {overlaps.length ? "Save anyway" : form.id ? "Save changes" : "Add class"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function describeOther(c: DetectedConflict, selfId: string, data: SchedulerData) {
  const other = c.entryA.id === selfId ? c.entryB : c.entryA;
  if (!other) return "";
  const subject = data.subjects.find((s) => s.id === other.subjectId)?.code ?? "class";
  const section = data.sections.find((s) => s.id === other.sectionId)?.name ?? "";
  return `${subject} ${section}, ${DAY_LONG[other.dayOfWeek]} ${formatTime(other.startMin)}`;
}
