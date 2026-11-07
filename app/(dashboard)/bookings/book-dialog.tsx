"use client";

import { useState } from "react";
import { ArrowRight, CircleNotch, Siren, Warning } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRange } from "@/lib/scheduler/timetable";
import { isOverride, PRIORITY_LABEL, URGENT_REASONS } from "@/lib/bookings/plan";
import type { Placement } from "@/lib/occupancy/adjust";
import type { RoomOption } from "./actions";
import { formatDay } from "./format";
import type { SearchRequest } from "./search-form";

const classes = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;
const slot = (p: Placement) => `${p.roomName}, ${formatRange(p.startMin, p.endMin)}`;

/** Booking summary; every displaced class and booking is listed, and an override with impact needs an explicit confirmation. */
export function BookDialog({ option, request, pending, onConfirm, onClose }: { option: RoomOption | null; request: SearchRequest | null; pending: boolean; onConfirm: (choices: Record<string, string>) => void; onClose: () => void }) {
  const [agreed, setAgreed] = useState(false);
  // Placement picked per displaced class; a class not listed keeps the recommended one.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const items = option?.items ?? [];
  const displaced = option?.displaced ?? [];
  const impact = items.length + displaced.length;
  const urgent = !!request && isOverride(request.priority);
  const close = () => { setAgreed(false); setPicked({}); onClose(); };
  const summary = [items.length && `${classes(items.length)} will be moved`, displaced.length && `${displaced.length} booking${displaced.length > 1 ? "s" : ""} will be moved or cancelled`].filter(Boolean).join(" and ");

  return (
    <Dialog open={!!option} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{urgent && <Siren className="size-5 text-danger" />}{option?.needsApproval ? "Request" : "Book"} {option?.name}?</DialogTitle>
          <DialogDescription>{option?.needsApproval ? `${option.needsApproval} must approve before anything moves.` : "Check the details before confirming."}</DialogDescription>
        </DialogHeader>
        {option && request && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg border p-4 text-sm">
              <dt className="text-muted-foreground">Purpose</dt><dd className="font-medium">{request.purpose}</dd>
              <dt className="text-muted-foreground">Room</dt><dd>{option.name} · {option.location}</dd>
              <dt className="text-muted-foreground">Date</dt><dd>{formatDay(request.date)}</dd>
              <dt className="text-muted-foreground">Time</dt><dd>{formatRange(request.startMin, request.endMin)}</dd>
              <dt className="text-muted-foreground">Attendees</dt><dd>{request.attendees} (capacity {option.capacity})</dd>
              <dt className="text-muted-foreground">Priority</dt><dd>{PRIORITY_LABEL[request.priority]}</dd>
              {request.repeatUntil && <><dt className="text-muted-foreground">Repeats</dt><dd>Every week until {formatDay(request.repeatUntil)}. Dates that are taken or closed are skipped.</dd></>}
              {urgent && <><dt className="text-muted-foreground">Reason</dt><dd>{URGENT_REASONS.find((r) => r.value === request.urgentReason)?.label}{request.reasonDetail ? `: ${request.reasonDetail}` : ""}</dd></>}
            </dl>

            {impact > 0 && (
              <section aria-labelledby="moves-title" className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
                <h3 id="moves-title" className="flex items-center gap-2 font-semibold text-warning"><Warning className="size-5" weight="fill" /> {summary[0].toUpperCase() + summary.slice(1)}</h3>
                <ul className="space-y-3">
                  {items.map((i, n) => {
                    // The recommended placement is first; with approval pending nothing is chosen yet, so the plan is only shown.
                    const alternatives = !option?.needsApproval && i.alternatives && i.alternatives.length > 1 ? i.alternatives : null;
                    const selected = alternatives?.find((a) => a.key === (picked[i.scheduleId] ?? i.chosen)) ?? null;
                    const kind = selected?.kind ?? i.kind;
                    const after = selected?.placement ?? i.after;
                    return (
                      <li key={`${i.scheduleId}-${n}`} className="space-y-1 rounded-md bg-card p-3 text-sm">
                        <p className="font-medium">{i.label}</p>
                        <p className="text-[13px] text-muted-foreground">{i.before.facultyName}</p>
                        <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                          {slot(i.before)}
                          <ArrowRight className="size-3.5 text-muted-foreground" aria-label="moves to" />
                          {kind === "ONLINE"
                            ? <span className="font-medium text-warning">Online or asynchronous at the same time</span>
                            : <span className="font-medium">{slot(after!)}{after!.date !== i.before.date && ` on ${formatDay(after!.date)}`}</span>}
                        </p>
                        {alternatives && (
                          <fieldset className="mt-2 space-y-1.5">
                            <legend className="text-xs font-medium text-muted-foreground">Choose where it goes</legend>
                            {alternatives.map((a, idx) => (
                              <label key={a.key} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-[13px] has-checked:border-primary has-checked:bg-primary/5">
                                <input type="radio" name={`placement-${i.scheduleId}`} checked={selected?.key === a.key} onChange={() => setPicked((p) => ({ ...p, [i.scheduleId]: a.key }))} className="mt-0.5" />
                                <span className="min-w-0">
                                  {a.kind === "ONLINE" ? "Online or asynchronous, at the usual time" : <>{slot(a.placement)}{a.placement.date !== i.before.date && <span className="text-muted-foreground"> · make-up on {formatDay(a.placement.date)}</span>}</>}
                                  {idx === 0 && a.kind === "MOVED" && <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Recommended</span>}
                                </span>
                              </label>
                            ))}
                          </fieldset>
                        )}
                        {selected && <p className="text-xs text-muted-foreground">{selected.reason}</p>}
                      </li>
                    );
                  })}
                  {displaced.map((d) => (
                    <li key={d.bookingId} className="space-y-1 rounded-md bg-card p-3 text-sm">
                      <p className="font-medium">Booking: {d.purpose} <span className="text-xs text-muted-foreground">({PRIORITY_LABEL[d.priority]} priority)</span></p>
                      <p className="text-[13px]">{d.toRoomName ? `Moves to ${d.toRoomName} at the same time` : <span className="text-danger">Cancelled; no other room of that type is free</span>}</p>
                    </li>
                  ))}
                </ul>
                <p className="text-[13px]">Faculty, learners, and the Heads of Department concerned are notified by bell and email. Cancelling or shortening this booking can restore them.</p>
                {urgent && !option.needsApproval && (
                  <label className="flex items-start gap-2 text-sm font-medium">
                    <Checkbox checked={agreed} onCheckedChange={(on) => setAgreed(!!on)} className="mt-0.5" /> I confirm: {summary}.
                  </label>
                )}
              </section>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button disabled={pending || (urgent && impact > 0 && !option?.needsApproval && !agreed)} onClick={() => { onConfirm(picked); setAgreed(false); setPicked({}); }} variant={urgent && impact ? "destructive" : "default"}>
            {pending && <CircleNotch className="size-4 animate-spin" />}
            {option?.needsApproval ? "Send for approval" : impact ? `Book and move ${impact}` : "Confirm booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
