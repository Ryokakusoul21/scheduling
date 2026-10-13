"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleNotch, Plus, Warning, CheckCircle } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { ConfirmDialog } from "@/components/ux/form-dialog";
import { ActionButton } from "@/components/ux/action-button";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import { DEFAULT_GRID, formatRange, timeOptions } from "@/lib/scheduler/timetable";
import { checkExamAction, deleteExamAction, saveExamAction, type ExamInput } from "./actions";

export interface ExamRow {
  id: string;
  semesterId: string;
  sectionId: string;
  subjectId: string;
  roomId: string;
  proctorId: string;
  type: ExamInput["type"];
  date: string;
  startMin: number;
  endMin: number;
  notes: string;
  subject: string;
  section: string;
  room: string;
  proctor: string;
  term: string;
}

type Option = { value: string; label: string; level?: string };

const TYPES = [
  { value: "PRELIMINARY", label: "Preliminary" },
  { value: "MIDTERM", label: "Midterm" },
  { value: "FINAL", label: "Final" },
  { value: "SPECIAL", label: "Special" },
];
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t;
const TIMES = timeOptions({ ...DEFAULT_GRID, dayEnd: 21 * 60 }).map((t) => ({ value: String(t.value), label: t.label }));

const input = (f: typeof blank): ExamInput => ({ ...f, type: f.type as ExamInput["type"], startMin: Number(f.startMin), endMin: Number(f.endMin) });

const blank = { semesterId: "", sectionId: "", subjectId: "", roomId: "", proctorId: "", type: "MIDTERM", date: "", startMin: "480", endMin: "600", notes: "" };

export function ExamManager({
  rows,
  canEdit,
  options,
}: {
  rows: ExamRow[];
  canEdit: boolean;
  options: { terms: Option[]; sections: Option[]; subjects: Option[]; rooms: Option[]; faculty: Option[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [editing, setEditing] = useState<{ id?: string; form: typeof blank } | null>(null);
  const [deleting, setDeleting] = useState<ExamRow | null>(null);
  const [checked, setChecked] = useState<{ key: string; conflicts: string[]; warnings: string[] } | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter((r) => (!typeFilter || r.type === typeFilter) && (!q || [r.subject, r.section, r.room, r.proctor, r.date].some((v) => v.toLowerCase().includes(q))));
  }, [rows, query, typeFilter]);

  const form = editing?.form;
  const level = options.terms.find((t) => t.value === form?.semesterId)?.level;

  const complete = !!form && Object.entries(form).every(([k, v]) => k === "notes" || v !== "");

  // Live conflict check whenever the form is complete; results only count for the form they were computed for.
  const formKey = editing && complete ? JSON.stringify(editing) : null;
  const check = checked && checked.key === formKey ? checked : null;
  useEffect(() => {
    if (!formKey) return;
    const { id, form: f } = JSON.parse(formKey) as { id?: string; form: typeof blank };
    const timer = setTimeout(async () => {
      const res = await checkExamAction(input(f), id);
      setChecked({ key: formKey, ...(res.ok ? res.data : { conflicts: [res.error], warnings: [] }) });
    }, 300);
    return () => clearTimeout(timer);
  }, [formKey]);

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) =>
    setEditing((s) => (s ? { ...s, form: { ...s.form, [k]: e.target.value } } : s));

  function save() {
    if (!editing) return;
    startTransition(async () => {
      const res = await saveExamAction(input(editing.form), editing.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Examination saved and the proctor notified.");
      setEditing(null);
      router.refresh();
    });
  }

  const byLevel = (list: Option[]) => (level ? list.filter((o) => o.level === level) : list);

  return (
    <Card className="print-area">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 print:hidden">
        <CardTitle className="text-base">Examination schedule</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search subject, section, room, proctor" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 w-64" />
          <NativeSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} options={[{ value: "", label: "All types" }, ...TYPES]} className="w-36" />
          <ExportButtons
            filename="examination-schedule"
            rows={filtered}
            columns={[
              { header: "Date", value: (r) => r.date },
              { header: "Time", value: (r) => formatRange(r.startMin, r.endMin) },
              { header: "Type", value: (r) => typeLabel(r.type) },
              { header: "Subject", value: (r) => r.subject },
              { header: "Section", value: (r) => r.section },
              { header: "Room", value: (r) => r.room },
              { header: "Proctor", value: (r) => r.proctor },
              { header: "Term", value: (r) => r.term },
            ]}
          />
          {canEdit && (
            <Button size="sm" onClick={() => setEditing({ form: { ...blank, semesterId: options.terms[0]?.value ?? "" } })}>
              <Plus className="size-4" /> Schedule examination
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <PrintHeader title="Examination Schedule" />
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date and time</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Proctor</TableHead>
                <TableHead>Type</TableHead>
                {canEdit && <TableHead className="print:hidden" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No examinations match.</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{r.date}<br /><span className="text-xs text-muted-foreground">{formatRange(r.startMin, r.endMin)}</span></TableCell>
                  <TableCell className="max-w-60">{r.subject}</TableCell>
                  <TableCell>{r.section}</TableCell>
                  <TableCell>{r.room}</TableCell>
                  <TableCell>{r.proctor}</TableCell>
                  <TableCell><Badge variant="secondary">{typeLabel(r.type)}</Badge></TableCell>
                  {canEdit && (
                    <TableCell className="print:hidden">
                      <div className="flex justify-end gap-1.5">
                        <ActionButton kind="edit" onClick={() => setEditing({ id: r.id, form: { ...r, startMin: String(r.startMin), endMin: String(r.endMin) } })} />
                        <ActionButton kind="delete" onClick={() => setDeleting(r)} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit examination" : "Schedule examination"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="x-term">Term</FieldLabel>
                <NativeSelect id="x-term" value={form.semesterId} onChange={set("semesterId")} options={options.terms} placeholder="Choose a term" />
              </Field>
              <Field>
                <FieldLabel htmlFor="x-type">Examination type</FieldLabel>
                <NativeSelect id="x-type" value={form.type} onChange={set("type")} options={TYPES} />
              </Field>
              <Field>
                <FieldLabel htmlFor="x-section">Section</FieldLabel>
                <NativeSelect id="x-section" value={form.sectionId} onChange={set("sectionId")} options={byLevel(options.sections)} placeholder="Choose a section" />
              </Field>
              <Field>
                <FieldLabel htmlFor="x-subject">Subject</FieldLabel>
                <NativeSelect id="x-subject" value={form.subjectId} onChange={set("subjectId")} options={byLevel(options.subjects)} placeholder="Choose a subject" />
              </Field>
              <Field>
                <FieldLabel htmlFor="x-date">Date</FieldLabel>
                <Input id="x-date" type="date" value={form.date} onChange={set("date")} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field>
                  <FieldLabel htmlFor="x-start">Start</FieldLabel>
                  <NativeSelect id="x-start" value={form.startMin} onChange={set("startMin")} options={TIMES} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="x-end">End</FieldLabel>
                  <NativeSelect id="x-end" value={form.endMin} onChange={set("endMin")} options={TIMES} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="x-room">Room</FieldLabel>
                <NativeSelect id="x-room" value={form.roomId} onChange={set("roomId")} options={options.rooms} placeholder="Choose a room" />
              </Field>
              <Field>
                <FieldLabel htmlFor="x-proctor">Proctor</FieldLabel>
                <NativeSelect id="x-proctor" value={form.proctorId} onChange={set("proctorId")} options={options.faculty} placeholder="Choose a proctor" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="x-notes">Notes</FieldLabel>
                <Textarea id="x-notes" rows={2} value={form.notes} onChange={set("notes")} />
              </Field>
              <div className="sm:col-span-2" aria-live="polite">
                {check && check.conflicts.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {check.conflicts.map((c) => <p key={c} className="flex gap-2"><Warning className="mt-0.5 size-4 shrink-0" />{c}</p>)}
                  </div>
                )}
                {check && check.conflicts.length === 0 && (
                  <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle className="size-4" /> No room, proctor, or section conflicts.</p>
                )}
                {check?.warnings.map((w) => <p key={w} className="mt-1 text-xs text-amber-600">{w}</p>)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={pending || !check || check.conflicts.length > 0}>
              {pending && <CircleNotch className="size-4 animate-spin" />} Save examination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this examination?"
        description={deleting ? `${deleting.subject} for ${deleting.section} on ${deleting.date} will be removed.` : ""}
        onConfirm={async () => {
          const res = await deleteExamAction(deleting!.id);
          if (res.ok) router.refresh();
          return res;
        }}
        successMessage="Examination deleted."
      />
    </Card>
  );
}
