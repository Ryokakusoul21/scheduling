"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, CircleNotch, Clock, Copy, XCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatRange } from "@/lib/scheduler/timetable";
import { bookingTimelineAction, reviewOverrideAction } from "./actions";
import type { BookingRow } from "./booking-workspace";
import { PriorityBadge, StatusBadge } from "./bookings-list";

const ACK: Record<string, string> = { PENDING: "Waiting for a response", ACKNOWLEDGED: "Acknowledged", ALTERNATIVE_REQUESTED: "Asked for an alternative" };

/** Everything about one booking: details, moved classes, displaced bookings, acknowledgements, approval, and the timeline. */
export function BookingDrawer({ booking: b, onClose, onCancel, onDuplicate, pending }: { booking: BookingRow | null; onClose: () => void; onCancel: (id: string, restore: boolean) => void; onDuplicate: (b: BookingRow) => void; pending: boolean }) {
  const router = useRouter();
  const [timeline, setTimeline] = useState<{ id: string; at: string; who: string; action: string }[] | null>(null);
  const [note, setNote] = useState("");
  const [deciding, start] = useTransition();

  useEffect(() => {
    if (!b) return;
    let live = true;
    void bookingTimelineAction(b.id).then((r) => live && setTimeline(r.ok ? r.data : []));
    return () => { live = false; setTimeline(null); };
  }, [b]);

  function decide(approve: boolean) {
    if (!b) return;
    start(async () => {
      const r = await reviewOverrideAction(b.id, approve, note.trim() || undefined);
      if (!r.ok) return void toast.error(r.error, { duration: 12000 });
      toast.success(approve ? "Override approved; displaced classes were moved and everyone notified." : "Override rejected; the requester was notified.");
      setNote("");
      router.refresh();
      onClose();
    });
  }

  return (
    <Sheet open={!!b} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:max-w-lg">
        {b && (
          <>
            <SheetHeader className="p-0">
              <SheetTitle>{b.purpose}</SheetTitle>
              <SheetDescription>{b.roomName} · {b.dateLabel}, {formatRange(b.startMin, b.endMin)}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-wrap items-center gap-2"><StatusBadge b={b} /><PriorityBadge priority={b.priority} /></div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Booked by</dt><dd>{b.bookedBy}</dd>
              <dt className="text-muted-foreground">Attendees</dt><dd>{b.attendees}</dd>
              {b.reason && <><dt className="text-muted-foreground">Reason</dt><dd>{b.reason}{b.reasonDetail ? `: ${b.reasonDetail}` : ""}</dd></>}
              {b.awaitingDepartment && <><dt className="text-muted-foreground">Approval</dt><dd>Awaiting {b.awaitingDepartment}</dd></>}
              {b.reviewNote && <><dt className="text-muted-foreground">Review note</dt><dd>{b.reviewNote}</dd></>}
            </dl>

            {b.canApprove && (
              <section className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="text-sm font-medium">This urgent override takes a room of your department.</p>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the requester (optional)" maxLength={500} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" disabled={deciding} onClick={() => decide(true)}>{deciding ? <CircleNotch className="size-4 animate-spin" /> : <CheckCircle className="size-4" />} Approve and apply</Button>
                  <Button size="sm" variant="outline" disabled={deciding} onClick={() => decide(false)}>Reject</Button>
                </div>
              </section>
            )}

            {b.moves.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{b.moves.length} {b.moves.length === 1 ? "class" : "classes"} moved</h3>
                <ul className="space-y-2">
                  {b.moves.map((m, i) => (
                    <li key={`${m.label}-${i}`} className="rounded-lg border p-3 text-[13px]">
                      <p className="font-medium">{m.label}{m.faculty && <span className="font-normal text-muted-foreground"> · {m.faculty}</span>}</p>
                      <p>{m.from} → {m.to}</p>
                      <p className="text-muted-foreground">{m.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {b.displaced.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Bookings displaced</h3>
                <ul className="space-y-1 text-[13px]">{b.displaced.map((d, i) => <li key={i}><span className="font-medium">{d.purpose}</span>: {d.outcome}</li>)}</ul>
              </section>
            )}

            {b.acknowledgements.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Faculty acknowledgements</h3>
                <ul className="space-y-1 text-[13px]">
                  {b.acknowledgements.map((a, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{a.faculty}</span>
                      <span className={a.status === "ALTERNATIVE_REQUESTED" ? "text-warning" : a.status === "ACKNOWLEDGED" ? "text-success" : "text-muted-foreground"}>{ACK[a.status]}</span>
                      {a.note && <span className="w-full text-muted-foreground">&ldquo;{a.note}&rdquo;</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Timeline</h3>
              {timeline === null ? <p className="text-[13px] text-muted-foreground">Loading…</p> : timeline.length === 0 ? <p className="text-[13px] text-muted-foreground">No recorded changes.</p> : (
                <ol className="space-y-2 border-l pl-4">
                  {timeline.map((t) => (
                    <li key={t.id} className="relative text-[13px]">
                      <Clock className="absolute -left-[1.4rem] top-0.5 size-3.5 bg-popover text-muted-foreground" />
                      <p>{t.action}</p>
                      <p className="text-xs text-muted-foreground">{t.who} · {new Date(t.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button size="sm" variant="outline" onClick={() => { onDuplicate(b); onClose(); }}><Copy className="size-4" /> Duplicate</Button>
              {b.canCancel && <Button size="sm" variant="outline" className="text-destructive" disabled={pending} onClick={() => { onCancel(b.id, true); onClose(); }}><XCircle className="size-4" /> Cancel and restore</Button>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
