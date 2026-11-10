"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch, Copy, Trash } from "@phosphor-icons/react/ssr";
import { ConflictAlert, NoConflict } from "@/components/ux/conflict";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ux/native-select";
import { detectConflicts, isOverlapConflict } from "@/lib/scheduler/conflictDetector";
import { DAY_LONG, WEEK_DAYS, formatTime, subjectAppliesToSection, timeOptions } from "@/lib/scheduler/timetable";
import type { DetectedConflict } from "@/lib/scheduler/types";
import { rankFaculty, rankRooms } from "@/lib/scheduler/suggest";
import { assignedFor } from "@/lib/subjects/assignment-rules";
import { projectionWarning } from "@/lib/workload/projection";
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
  changeReason?: string;
  doNotMove?: boolean;
  source?: "CURRICULUM_QUEUE";
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
  readOnly = false,
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
  readOnly?: boolean;
  onSave: (input: ClassInput) => Promise<boolean>;
  onDelete: (id: string, reason?: string) => Promise<boolean>;
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
            readOnly={readOnly}
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
  readOnly,
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
  readOnly: boolean;
  onSave: (input: ClassInput) => Promise<boolean>;
  onDelete: (id: string, reason?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ClassDraft>(draft);
  const [changeReason, setChangeReason] = useState("");
  const [pending, startTransition] = useTransition();
  const locked = readOnly || draft.status === "REVIEW" || (draft.status === "PUBLISHED" && !canPublish);
  const set = <K extends keyof ClassDraft>(k: K, v: ClassDraft[K]) => setForm((f) => ({ ...f, [k]: v }));

  const section = data.sections.find((s) => s.id === form.sectionId);
  const subject = data.subjects.find((s) => s.id === form.subjectId);
  const term = data.terms.find((t) => t.id === form.semesterId);

  const termOptions = data.terms
    .filter((t) => !section || (t.level === section.level && (!t.programId || t.programId === section.programId)))
    .map((t) => ({ value: t.id, label: t.label }));

  const subjectOptions = data.subjects
    .filter((s) => (!s.archived || s.id === form.subjectId) && (!section || subjectAppliesToSection(s, section)))
    .map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));

  // Entries in terms that run at the same time as this one (for busy/conflict checks).
  const concurrent = useMemo(() => {
    if (!term) return entries;
    const ids = new Set(data.terms.filter((t) => t.start <= term.end && term.start <= t.end).map((t) => t.id));
    return entries.filter((e) => ids.has(e.semesterId) && e.id !== form.id);
  }, [entries, data.terms, term, form.id]);

  const slot = { dayOfWeek: form.dayOfWeek, startMin: form.startMin, endMin: form.endMin };

  const [showAllFaculty, setShowAllFaculty] = useState(false);
  const assignedId = form.subjectId && form.sectionId ? assignedFor(data.assignments, form.subjectId, form.sectionId) : null;
  const assignedFaculty = data.faculty.find((f) => f.id === assignedId) ?? null;
  const restricted = !!assignedFaculty && !showAllFaculty;

  const facultyOptions = useMemo(() => {
    // An assigned subject offers only its professor (and the current one, so an existing class still shows) unless overridden.
    const pool = data.faculty.filter((f) => restricted ? f.id === assignedId || f.id === form.facultyId : f.status === "ACTIVE" || f.id === form.facultyId);
    const byId = new Map(pool.map((f) => [f.id, f]));
    return rankFaculty(pool, slot, concurrent, section?.level).map((r) => {
      const f = byId.get(r.id)!;
      const name = `${f.foreign ? `${f.fullName} (another department, needs approval)` : f.fullName}${f.id === assignedId ? " (assigned)" : ""}`;
      return { value: r.id, label: r.notes.length ? `${name} — ${r.notes.join(", ")}` : `${name} ✓` };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slot fields listed individually
  }, [data.faculty, section?.level, form.facultyId, concurrent, restricted, assignedId, slot.dayOfWeek, slot.startMin, slot.endMin]);

  const roomOptions = useMemo(() => {
    const pool = data.rooms.filter((r) => !r.archived || r.id === form.roomId);
    const byId = new Map(pool.map((r) => [r.id, r]));
    return rankRooms(pool, slot, concurrent, {
      studentCount: section?.studentCount,
      component: form.component,
      requiredRoomType: subject?.requiredRoomType,
      programId: section?.programId,
    }).map((r) => {
      const room = byId.get(r.id)!;
      return {
        value: r.id,
        label: `${room.roomName} (${room.capacity}) · ${room.location}${room.foreign ? " · another department, needs approval" : ""}${r.notes.length ? ` — ${r.notes.join(", ")}` : " ✓"}`,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slot fields listed individually
  }, [data.rooms, form.roomId, section?.studentCount, subject?.requiredRoomType, form.component, concurrent, slot.dayOfWeek, slot.startMin, slot.endMin]);

  // Live conflict preview for the candidate placement.
  // Projected teaching loads: the new teacher gains this meeting, a replaced teacher loses it.
  const loadWarnings = useMemo(() => {
    const unit = data.workload.measure === "HOURS" ? "hours" : "units";
    const teaches = (facultyId: string) => entries.some((e) => e.id !== draft.id && e.facultyId === facultyId && e.sectionId === form.sectionId && e.subjectId === form.subjectId);
    const amount = (facultyId: string) => (data.workload.measure === "HOURS" ? (form.endMin - form.startMin) / 60 : teaches(facultyId) ? 0 : (subject?.units ?? 0));
    const loadOf = (id: string) => data.workload.loads.find((l) => l.facultyId === id);
    const changes: [string, number][] = [];
    if (form.facultyId && form.facultyId !== draft.facultyId) changes.push([form.facultyId, amount(form.facultyId)]);
    if (draft.id && draft.facultyId && draft.facultyId !== form.facultyId) changes.push([draft.facultyId, -((draft.endMin - draft.startMin) / 60)]);
    if (draft.id && form.facultyId === draft.facultyId && data.workload.measure === "HOURS") changes.push([form.facultyId, (form.endMin - form.startMin - (draft.endMin - draft.startMin)) / 60]);
    return changes.flatMap(([id, delta]) => { const l = loadOf(id); const w = l && delta ? projectionWarning(l, delta, unit) : null; return w ? [w] : []; });
  }, [data.workload, entries, draft, form.facultyId, form.sectionId, form.subjectId, form.startMin, form.endMin, subject?.units]);

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
    if ((draft.status === "PUBLISHED" || draft.status === "REVIEW") && !changeReason.trim()) {
      toast.error("Document a reason for changing this submitted class.");
      return;
    }
    startTransition(async () => {
      const ok = await onSave({ ...form, notes: form.notes ?? "", changeReason });
      if (ok) onClose();
    });
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{locked ? "Class details" : form.id ? "Edit class" : "Add class"}</DialogTitle>
        <DialogDescription>
          {locked && draft.status === "PUBLISHED"
            ? "Published schedule is locked. Ask the Registrar to record a documented change."
            : locked
            ? "This schedule is waiting for a Registrar decision."
            : directEdit
            ? "Changes are saved and applied immediately."
            : "Changes to published classes are sent for review before they go live."}
        </DialogDescription>
      </DialogHeader>

      <fieldset disabled={locked} className="contents">
      <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="cls-section">Section</FieldLabel>
          <NativeSelect
            id="cls-section"
            value={form.sectionId}
            onChange={(e) => set("sectionId", e.target.value)}
            placeholder="Select section"
            options={data.sections.filter((s) => !s.archived || s.id === form.sectionId).map((s) => ({ value: s.id, label: s.name }))}
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
          {assignedFaculty && <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showAllFaculty} onChange={(e) => setShowAllFaculty(e.target.checked)} /> Show all faculty</label>}
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
        {(draft.status === "PUBLISHED" || draft.status === "REVIEW") && form.id ? (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="cls-change-reason">Reason for published schedule change</FieldLabel>
            <Textarea id="cls-change-reason" rows={2} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} maxLength={500} required />
          </Field>
        ) : (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="cls-notes">Notes</FieldLabel>
            <Textarea id="cls-notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </Field>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-sm sm:col-span-2">
          <Checkbox checked={!!form.doNotMove} onCheckedChange={(on) => set("doNotMove", !!on)} className="mt-0.5" />
          <span>
            <span className="font-medium">Do not move for urgent bookings</span>
            <span className="block text-[13px] text-muted-foreground">For example a laboratory with fixed equipment. An urgent booking cannot take this room at class time unless the Registrar confirms.</span>
          </span>
        </label>
      </FieldGroup>

      <div className="mt-4 space-y-2" aria-live="polite">
        {overlaps.map((c, i) => (
          <ConflictAlert key={`o${i}`} title={c.description}>{describeOther(c, form.id ?? "__candidate__", data)}</ConflictAlert>
        ))}
        {assignedFaculty && form.facultyId && form.facultyId !== assignedFaculty.id && (
          <ConflictAlert severity="warning" title={`This subject is assigned to ${assignedFaculty.fullName}.`}>Change the assignment on the Subjects page if someone else should teach it.</ConflictAlert>
        )}
        {loadWarnings.map((w) => <ConflictAlert key={w} severity="warning" title={w} />)}
        {warnings.map((c, i) => <ConflictAlert key={`w${i}`} severity="warning" title={c.description} />)}
        {preview.length === 0 && form.facultyId && form.roomId && <NoConflict>No conflicts for this time slot.</NoConflict>}
      </div>

      </fieldset>

      <DialogFooter className="mt-6 flex-wrap gap-2 sm:justify-between">
        <div className="flex gap-2">
          {form.id && !locked && (
            <>
              {!(canPublish && draft.status === "PUBLISHED") && <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setForm((f) => ({ ...f, id: undefined, status: undefined }))}
                title="Turn this form into a new copy of the class"
              >
                <Copy className="size-4" /> Duplicate
              </Button>}
              {(draft.status !== "PUBLISHED" && draft.status !== "REVIEW" || canPublish && draft.status === "PUBLISHED") && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      if (!window.confirm("Delete this class from the schedule?")) return;
                      if (draft.status === "PUBLISHED" && !changeReason.trim()) {
                        toast.error("Document a reason before removing this published class.");
                        return;
                      }
                      if (await onDelete(form.id!, changeReason)) onClose();
                    })
                  }
                >
                  <Trash className="size-4" /> Delete
                </Button>
              )}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant={locked ? "outline" : "ghost"} onClick={onClose}>
            {locked ? "Close" : "Cancel"}
          </Button>
          {!locked && (
            <Button type="submit" disabled={pending}>
              {pending && <CircleNotch className="size-4 animate-spin" />}
              {overlaps.length ? "Save anyway" : form.id ? "Save changes" : "Add class"}
            </Button>
          )}
        </div>
      </DialogFooter>
    </form>
  );
}

function describeOther(c: DetectedConflict, selfId: string, data: SchedulerData) {
  const other = c.entryA.id === selfId ? c.entryB : c.entryA;
  if (!other) return "";
  if ((other as SchedulerEntry).busy) return `a class of another department, ${DAY_LONG[other.dayOfWeek]} ${formatTime(other.startMin)}`;
  const subject = data.subjects.find((s) => s.id === other.subjectId)?.code ?? "class";
  const section = data.sections.find((s) => s.id === other.sectionId)?.name ?? "";
  return `${subject} ${section}, ${DAY_LONG[other.dayOfWeek]} ${formatTime(other.startMin)}`;
}
