"use client";

import { ArrowRight, Check, PencilSimple, Prohibit, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatWhen, timeAgo } from "@/lib/format/when";
import { TYPE_LABELS, type RequestRow, type RequestSummary } from "@/lib/requests/rules";
import { cn } from "@/lib/utils";
import { RequestTypeBadge } from "./request-type-badge";
import { StatusBadge } from "./status-badge";

type Step = { key: string; title: string; detail: string; tone: "done" | "current" | "bad" | "muted" };

/** Submitted, then reviewed, then the outcome; the review time is the last update once the request leaves Pending. */
function timeline(r: RequestRow): Step[] {
  const sent = new Date(r.createdAt);
  const last = new Date(r.updatedAt);
  const steps: Step[] = [{ key: "sent", title: "Submitted", detail: `${r.requestedByName} · ${formatWhen(sent)}`, tone: "done" }];
  if (r.status === "PENDING") return [...steps, { key: "wait", title: "Waiting for review", detail: `Sent ${timeAgo(sent)}`, tone: "current" }];
  if (r.status === "CANCELLED") return [...steps, { key: "cancel", title: "Cancelled by the requester", detail: formatWhen(last), tone: "muted" }];
  const rejected = r.status === "REJECTED";
  return [
    ...steps,
    { key: "review", title: "Reviewed", detail: `${r.reviewedByName || "A reviewer"} · ${formatWhen(last)}`, tone: "done" },
    { key: "result", title: rejected ? "Rejected" : r.status === "COMPLETED" ? "Approved and applied" : "Approved", detail: rejected ? "No changes were made." : "The decision was sent to the requester.", tone: rejected ? "bad" : "done" },
  ];
}

const DOT = { done: "bg-emerald-600", current: "bg-amber-500", bad: "bg-red-600", muted: "bg-slate-400" };

function Compare({ label, from, to }: { label: string; from?: string; to?: string }) {
  if (!from && !to) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-16 text-muted-foreground">{label}</span>
      <span>{from ?? "—"}</span>
      <ArrowRight className="size-4" aria-hidden />
      <span className="font-medium">{to ?? "—"}</span>
    </div>
  );
}

const fields: [keyof RequestSummary, string][] = [["room", "Room"], ["day", "Day"], ["time", "Time"], ["faculty", "Faculty"]];

export function RequestDrawer({ row, onClose, onEdit, onCancel, onReview }: {
  row: RequestRow; onClose: () => void; onEdit: () => void; onCancel: () => void; onReview: (status: "APPROVED" | "REJECTED") => void;
}) {
  const changes = fields.filter(([k]) => row.requested?.[k]);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-lg">{TYPE_LABELS[row.type] ?? row.type} request</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2"><RequestTypeBadge type={row.type} /><StatusBadge status={row.status} /></SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4 text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">Class</dt><dd>{row.scheduleLabel}</dd>
            <dt className="text-muted-foreground">Requested by</dt><dd>{row.requestedByName}</dd>
            <dt className="text-muted-foreground">Sent</dt><dd>{formatWhen(new Date(row.createdAt))} ({timeAgo(new Date(row.createdAt))})</dd>
          </dl>

          <section aria-labelledby="req-details" className="space-y-1">
            <h3 id="req-details" className="font-semibold">Details</h3>
            <p className="whitespace-pre-wrap">{row.reason}</p>
          </section>

          {changes.length > 0 && (
            <section aria-labelledby="req-change" className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <h3 id="req-change" className="font-semibold">Current and requested</h3>
              {changes.map(([k, label]) => <Compare key={k} label={label} from={row.current?.[k]} to={row.requested?.[k]} />)}
            </section>
          )}

          {row.workloadWarning && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">{row.workloadWarning}</p>}

          <section aria-labelledby="req-timeline" className="space-y-3">
            <h3 id="req-timeline" className="font-semibold">Status</h3>
            <ol className="space-y-4">
              {timeline(row).map((s, i, all) => (
                <li key={s.key} aria-current={s.tone === "current" ? "step" : undefined} className="relative flex gap-3">
                  {i < all.length - 1 && <span aria-hidden className="absolute top-4 left-[5px] h-[calc(100%+0.25rem)] w-px bg-border" />}
                  <span aria-hidden className={cn("relative mt-1.5 size-3 shrink-0 rounded-full", DOT[s.tone])} />
                  <div><p className="font-medium">{s.title}</p><p className="text-muted-foreground">{s.detail}</p></div>
                </li>
              ))}
            </ol>
          </section>

          {row.reviewNote && (
            <section aria-labelledby="req-note" className="space-y-1">
              <h3 id="req-note" className="font-semibold">Reviewer comments</h3>
              <p className="whitespace-pre-wrap rounded-lg border p-3">{row.reviewNote}</p>
            </section>
          )}
        </div>

        {(row.canEdit || row.canCancel || row.canReview) && (
          <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
            {row.canEdit && <Button variant="outline" onClick={onEdit}><PencilSimple className="size-4" /> Edit</Button>}
            {row.canCancel && <Button variant="outline" onClick={onCancel}><Prohibit className="size-4" /> Cancel request</Button>}
            {row.canReview && <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => onReview("REJECTED")}><X className="size-4" /> Reject</Button>}
            {row.canReview && <Button onClick={() => onReview("APPROVED")}><Check className="size-4" /> Approve</Button>}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
