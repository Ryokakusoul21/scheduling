"use client";

import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ux/native-select";
import { DETAILS_MAX, REQUEST_TYPES, requestFormSchema, type RequestFormData, type RequestFormInput, type RequestRow, type RequestSummary } from "@/lib/requests/rules";
import { cn } from "@/lib/utils";
import { ScheduleCombobox, type ScheduleOption } from "./schedule-combobox";

export type Option = { id: string; label: string };
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const dayName = (d: string) => `${d[0]}${d.slice(1).toLowerCase()}`;
const clock = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 === 0 ? 12 : h % 12}:${hhmm.slice(3)} ${h >= 12 ? "PM" : "AM"}`;
};

function Label({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
      {required && <span aria-hidden className="ml-0.5 text-destructive">*</span>}
      {required && <span className="sr-only"> (required)</span>}
    </label>
  );
}

function Problem({ id, message }: { id: string; message?: string }) {
  return <p id={id} role={message ? "alert" : undefined} className="min-h-5 text-sm text-destructive">{message}</p>;
}

/** Submit or edit a request; the class picker and the "requested" fields change with the type. */
export function RequestFormModal({ open, onOpenChange, editing, schedules, rooms, faculty, onSubmit }: {
  open: boolean; onOpenChange: (open: boolean) => void; editing: RequestRow | null;
  schedules: ScheduleOption[]; rooms: Option[]; faculty: Option[];
  /** Returns an error message, or null when saved. */
  onSubmit: (input: RequestFormInput, editingId: string | null) => Promise<string | null>;
}) {
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const saved = editing?.form;
  const form = useForm<RequestFormInput, unknown, RequestFormData>({
    resolver: zodResolver(requestFormSchema),
    mode: "onTouched",
    defaultValues: {
      type: saved?.type, scheduleId: saved?.scheduleId ?? "", reason: saved?.reason ?? "", requestedRoomId: saved?.requestedRoomId ?? "",
      requestedDay: saved?.requestedDay ?? "", requestedStart: saved?.requestedStart ?? "", requestedEnd: saved?.requestedEnd ?? "", requestedFacultyId: saved?.requestedFacultyId ?? "",
    },
  });
  const { register, control, handleSubmit, formState: { errors } } = form;
  const [type, scheduleId, reason, roomId, facultyId, day, start_, end] = useWatch({ control, name: ["type", "scheduleId", "reason", "requestedRoomId", "requestedFacultyId", "requestedDay", "requestedStart", "requestedEnd"] });
  const kind = REQUEST_TYPES.find((t) => t.value === type);
  const chosen = schedules.find((s) => s.id === scheduleId);

  const current: RequestSummary | null = chosen ? { room: chosen.room, day: chosen.day, time: chosen.time, faculty: chosen.faculty } : null;
  const requested: RequestSummary | null =
    type === "CHANGE_ROOM" && roomId ? { room: rooms.find((r) => r.id === roomId)?.label }
    : type === "CHANGE_FACULTY" && facultyId ? { faculty: faculty.find((f) => f.id === facultyId)?.label }
    : type === "CHANGE_TIME" && day && start_ && end ? { day: dayName(day), time: `${clock(start_)} – ${clock(end)}` }
    : null;
  const previewRows: [string, string | undefined, string | undefined][] =
    type === "CHANGE_ROOM" ? [["Room", current?.room, requested?.room]]
    : type === "CHANGE_FACULTY" ? [["Faculty", current?.faculty, requested?.faculty]]
    : type === "CHANGE_TIME" ? [["Day", current?.day, requested?.day], ["Time", current?.time, requested?.time]]
    : [];

  function submit() {
    setFormError(null);
    start(async () => {
      const error = await onSubmit(form.getValues(), editing?.id ?? null);
      if (error) setFormError(error);
      else onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{editing ? "Edit request" : "Submit schedule request"}</DialogTitle>
          <DialogDescription className="text-sm">Reviewers are notified, and you can follow the decision on this page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="type" required>Request type</Label>
            <NativeSelect id="type" autoFocus aria-invalid={!!errors.type} aria-describedby="type-help type-error" {...register("type")}
              placeholder="Choose a request type" options={REQUEST_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
            <p id="type-help" className="text-sm text-muted-foreground">{kind?.hint ?? "Pick what you want to ask for."}</p>
            <Problem id="type-error" message={errors.type?.message} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="scheduleId" required={!!kind?.needsSchedule}>Related class</Label>
            <Controller control={control} name="scheduleId" render={({ field }) => (
              <ScheduleCombobox id="scheduleId" options={schedules} value={field.value ?? ""} onChange={field.onChange} disabled={!type || type === "NEW_SCHEDULE"} invalid={!!errors.scheduleId} describedBy="schedule-error" />
            )} />
            <Problem id="schedule-error" message={errors.scheduleId?.message} />
          </div>

          {type === "CHANGE_ROOM" && (
            <div className="space-y-1">
              <Label htmlFor="requestedRoomId" required>Room you want</Label>
              <NativeSelect id="requestedRoomId" aria-describedby="room-error" aria-invalid={!!errors.requestedRoomId} {...register("requestedRoomId")} placeholder="Choose a room" options={rooms.map((r) => ({ value: r.id, label: r.label }))} />
              <Problem id="room-error" message={errors.requestedRoomId?.message} />
            </div>
          )}
          {type === "CHANGE_FACULTY" && (
            <div className="space-y-1">
              <Label htmlFor="requestedFacultyId" required>Faculty member you want</Label>
              <NativeSelect id="requestedFacultyId" aria-describedby="faculty-error" aria-invalid={!!errors.requestedFacultyId} {...register("requestedFacultyId")} placeholder="Choose a faculty member" options={faculty.map((f) => ({ value: f.id, label: f.label }))} />
              <Problem id="faculty-error" message={errors.requestedFacultyId?.message} />
            </div>
          )}
          {type === "CHANGE_TIME" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="requestedDay" required>New day</Label>
                <NativeSelect id="requestedDay" aria-invalid={!!errors.requestedDay} {...register("requestedDay")} placeholder="Day" options={DAYS.map((d) => ({ value: d, label: dayName(d) }))} />
                <Problem id="day-error" message={errors.requestedDay?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="requestedStart" required>Starts</Label>
                <Input id="requestedStart" type="time" className="h-9 md:text-sm" aria-invalid={!!errors.requestedStart} {...register("requestedStart")} />
                <Problem id="start-error" message={errors.requestedStart?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="requestedEnd" required>Ends</Label>
                <Input id="requestedEnd" type="time" className="h-9 md:text-sm" aria-invalid={!!errors.requestedEnd} {...register("requestedEnd")} />
                <Problem id="end-error" message={errors.requestedEnd?.message} />
              </div>
            </div>
          )}

          {current && (type === "CHANGE_ROOM" || type === "CHANGE_TIME" || type === "CHANGE_FACULTY" || type === "CANCEL_SCHEDULE") && (
            <section aria-label="Current and requested" className="rounded-lg border bg-muted/40 p-3 text-sm">
              {type === "CANCEL_SCHEDULE" ? (
                <p>{chosen?.code} · {chosen?.section} on {current.day} {current.time} will be removed from the timetable if approved.</p>
              ) : (
                <dl className="space-y-1.5">
                  {previewRows.map(([name, from, to]) => (
                    <div key={name} className="flex flex-wrap items-center gap-2">
                      <dt className="w-14 text-muted-foreground">{name}</dt>
                      <dd className="flex flex-wrap items-center gap-2"><span>{from}</span><ArrowRight className="size-4" aria-hidden /><span className={cn("font-medium", !to && "text-muted-foreground")}>{to ?? "Not chosen yet"}</span></dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}

          <div className="space-y-1">
            <Label htmlFor="reason" required>Details</Label>
            <Textarea id="reason" rows={4} placeholder={kind?.placeholder ?? "Explain what you need and why."} aria-invalid={!!errors.reason} aria-describedby="reason-help" className="text-base md:text-sm" {...register("reason")} />
            <div id="reason-help" className="flex justify-between gap-2 text-sm">
              <span role={errors.reason ? "alert" : undefined} className={errors.reason ? "text-destructive" : "text-muted-foreground"}>{errors.reason?.message ?? "At least 10 characters."}</span>
              <span className={cn("tabular-nums", (reason?.trim().length ?? 0) > DETAILS_MAX ? "text-destructive" : "text-muted-foreground")}>{reason?.trim().length ?? 0}/{DETAILS_MAX}</span>
            </div>
          </div>

          {formError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{formError}</p>}
          <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <CircleNotch className="size-4 animate-spin" />} {editing ? "Save changes" : "Submit request"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
