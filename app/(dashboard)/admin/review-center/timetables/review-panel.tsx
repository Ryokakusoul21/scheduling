"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle, ChatText, NotePencil, UploadSimple, XCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addTimetableCommentAction, decideTimetableAction } from "./actions";

type Decision = "APPROVE" | "PUBLISH" | "RETURN" | "REJECT";

/** Decision buttons for one timetable: approve (now or with a publish date), publish, return, or reject. */
export function DecisionPanel({ id, status }: { id: string; status: "SUBMITTED" | "APPROVED" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [publishAt, setPublishAt] = useState("");

  function decide(decision: Decision) {
    if ((decision === "RETURN" || decision === "REJECT") && reason.trim().length < 3) return void toast.error("Write the reason first; the Head of Department sees it.");
    start(async () => {
      const res = await decideTimetableAction({ id, decision, reason: reason.trim() || undefined, publishAt: decision === "APPROVE" && publishAt ? publishAt : undefined });
      if (!res.ok) return void toast.error(res.error);
      toast.success(decision === "APPROVE" ? (publishAt ? "Approved and scheduled to publish." : "Approved. Publish it when ready.") : decision === "PUBLISH" ? "Published. Faculty were notified." : decision === "RETURN" ? "Returned to the Head of Department." : "Rejected.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {status === "SUBMITTED" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="publish-at" className="text-sm font-medium">Publish on (optional)</label>
            <Input id="publish-at" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            <p className="text-xs text-muted-foreground">Leave empty to publish yourself later, or use Approve and publish now.</p>
          </div>
          <div className="grid gap-2">
            <Button disabled={pending} onClick={() => decide("PUBLISH")}><UploadSimple className="size-4" /> Approve and publish now</Button>
            <Button variant="outline" disabled={pending} onClick={() => decide("APPROVE")}>{publishAt ? <CalendarCheck className="size-4" /> : <CheckCircle className="size-4" />} {publishAt ? "Approve and schedule" : "Approve only"}</Button>
          </div>
          <div className="space-y-1.5 border-t pt-4">
            <label htmlFor="decision-reason" className="text-sm font-medium">Reason for returning or rejecting</label>
            <Textarea id="decision-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What must change before this timetable can be approved" />
            <div className="grid gap-2">
              <Button variant="outline" disabled={pending} onClick={() => decide("RETURN")}><NotePencil className="size-4" /> Return for revision</Button>
              <Button variant="destructive" disabled={pending} onClick={() => decide("REJECT")}><XCircle className="size-4" /> Reject</Button>
            </div>
          </div>
        </>
      ) : (
        <Button className="w-full" disabled={pending} onClick={() => decide("PUBLISH")}><UploadSimple className="size-4" /> Publish now</Button>
      )}
    </div>
  );
}

/** Adds a comment about the whole timetable or, when rowId is given, one class or examination. */
export function CommentBox({ submissionId, rowId, rowLabel, compact = false }: { submissionId: string; rowId?: string; rowLabel?: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  if (!open) return <Button size="sm" variant="ghost" aria-label={`Comment on ${rowLabel}`} onClick={() => setOpen(true)}><ChatText className="size-4" /></Button>;
  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addTimetableCommentAction({ submissionId, rowId, rowLabel, body });
          if (!res.ok) return void toast.error(res.error);
          setBody("");
          if (compact) setOpen(false);
          router.refresh();
        });
      }}
    >
      <Input aria-label={rowLabel ? `Comment on ${rowLabel}` : "Comment on the timetable"} value={body} onChange={(e) => setBody(e.target.value)} placeholder={rowLabel ? "Comment on this row" : "Comment on the whole timetable"} className="h-8" autoFocus={compact} />
      <Button size="sm" type="submit" disabled={pending || body.trim().length < 2}>Add</Button>
    </form>
  );
}
