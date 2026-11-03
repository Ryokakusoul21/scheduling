"use client";

import { useState, useTransition } from "react";
import { CircleNotch } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TYPE_LABELS, type RequestRow } from "@/lib/requests/rules";

const REJECT_MIN = 5;

/** Replaces the browser prompt: a rejection needs a reason, an approval can carry a note. */
export function ReviewDialog({ row, status, onClose, onSubmit }: {
  row: RequestRow; status: "APPROVED" | "REJECTED"; onClose: () => void; onSubmit: (note: string) => Promise<string | null>;
}) {
  const reject = status === "REJECTED";
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tooShort = reject && note.trim().length < REJECT_MIN;

  function submit() {
    setTouched(true);
    if (tooShort) return;
    setError(null);
    start(async () => {
      const problem = await onSubmit(note.trim());
      if (problem) setError(problem);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reject ? "Reject" : "Approve"} this request?</DialogTitle>
          <DialogDescription>{TYPE_LABELS[row.type] ?? row.type} from {row.requestedByName} for {row.scheduleLabel}. {reject ? "They will see your reason." : "They will be notified."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <label htmlFor="review-note" className="text-sm font-medium">{reject ? "Reason" : "Comment (optional)"}{reject && <span aria-hidden className="ml-0.5 text-destructive">*</span>}</label>
          <Textarea id="review-note" rows={3} value={note} maxLength={500} autoFocus onChange={(e) => setNote(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={touched && tooShort} aria-describedby="review-help" className="text-base md:text-sm" />
          <p id="review-help" role={touched && tooShort ? "alert" : undefined} className={touched && tooShort ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {touched && tooShort ? `Give a reason of at least ${REJECT_MIN} characters.` : reject ? "Required." : "Shown to the requester."}
          </p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button variant={reject ? "destructive" : "default"} disabled={pending} onClick={submit}>{pending && <CircleNotch className="size-4 animate-spin" />} {reject ? "Reject request" : "Approve request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
