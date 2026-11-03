"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ux/native-select";
import { cn } from "@/lib/utils";
import { REASON_MAX, REASON_MIN, REQUEST_KINDS, subjectRequestSchema } from "@/lib/subjects/request-rules";
import { createSubjectRequestAction } from "./actions";
import type { AssignContext, SubjectInfo } from "./types";

type Kind = (typeof REQUEST_KINDS)[number]["value"];

/** Replaces the browser prompt: request type, a required reason, and an optional preferred teacher. */
export function RequestChangeModal({ subject, faculty, assignment, onClose }: {
  subject: SubjectInfo; faculty: AssignContext["faculty"]; assignment?: boolean; onClose: (sent: boolean) => void;
}) {
  const [kind, setKind] = useState<Kind>("CHANGE_FACULTY");
  const [reason, setReason] = useState("");
  const [preferred, setPreferred] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const parsed = subjectRequestSchema.safeParse({ subjectId: subject.id, kind, reason, preferredFacultyId: kind === "CHANGE_FACULTY" ? preferred : "" });
  const fieldError = touched && !parsed.success ? parsed.error.issues[0]?.message : null;
  const length = reason.trim().length;

  function submit() {
    setTouched(true);
    if (!parsed.success) return;
    setError(null);
    start(async () => {
      const result = await createSubjectRequestAction({ subjectId: subject.id, kind, reason, preferredFacultyId: kind === "CHANGE_FACULTY" ? preferred : "" });
      if (!result.ok) return setError(result.error ?? "The request could not be sent.");
      toast.success("Request sent. Track it in Schedule Requests.");
      onClose(true);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose(false)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">{assignment ? "Request assignment" : "Request change"} for {subject.code}</DialogTitle>
          <DialogDescription className="text-sm">
            {subject.name}{subject.departmentName ? ` is managed by ${subject.departmentName}.` : " is managed by another department."} The Head of Department who owns it decides in Schedule Requests; if it has no owning department, the Administrator does.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Request type</legend>
            <div className="grid grid-cols-2 gap-2">
              {REQUEST_KINDS.map((k) => (
                <label key={k.value} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm", kind === k.value && "border-primary bg-primary/5")}>
                  <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="size-4 accent-primary" />
                  {k.label}
                </label>
              ))}
            </div>
          </fieldset>

          {kind === "CHANGE_FACULTY" && (
            <label className="block space-y-1 text-sm font-medium">
              Preferred faculty (optional)
              <NativeSelect value={preferred} onChange={(e) => setPreferred(e.target.value)} options={[{ value: "", label: "No preference" }, ...faculty.map((f) => ({ value: f.id, label: `${f.name} · ${f.departmentName}` }))]} />
            </label>
          )}

          <div className="space-y-1">
            <label htmlFor="request-reason" className="text-sm font-medium">Reason</label>
            <Textarea id="request-reason" value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} rows={4} maxLength={REASON_MAX + 100} aria-invalid={!!fieldError} aria-describedby="request-reason-help" className="text-base md:text-sm" />
            <div id="request-reason-help" className="flex justify-between gap-2 text-sm">
              <span role={fieldError ? "alert" : undefined} className={fieldError ? "text-destructive" : "text-muted-foreground"}>{fieldError ?? `At least ${REASON_MIN} characters.`}</span>
              <span className={cn("tabular-nums", length > REASON_MAX ? "text-destructive" : "text-muted-foreground")}>{length}/{REASON_MAX}</span>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onClose(false)}>Cancel</Button>
          <Button disabled={pending || !parsed.success} onClick={submit}>{pending ? "Sending..." : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
