"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Siren } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { respondAcknowledgementAction } from "./actions";
import type { AckRow } from "./booking-workspace";

/** Classes of the signed-in faculty member moved by urgent bookings: acknowledge, or ask for another option. */
export function AcknowledgementPanel({ items }: { items: AckRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const open = items.filter((a) => a.status === "PENDING");
  if (!items.length) return null;

  function respond(id: string, status: "ACKNOWLEDGED" | "ALTERNATIVE_REQUESTED") {
    start(async () => {
      const r = await respondAcknowledgementAction(id, status, status === "ALTERNATIVE_REQUESTED" ? note : undefined);
      if (!r.ok) return void toast.error(r.error);
      toast.success(status === "ACKNOWLEDGED" ? "Acknowledged. The booker was notified." : "Request sent to the booker and your Head of Department.");
      setAsking(null);
      setNote("");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="acks-title" className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-5">
      <h2 id="acks-title" className="flex items-center gap-2 text-base font-semibold"><Siren className="size-5 text-danger" /> Your classes moved by urgent bookings{open.length ? ` (${open.length} need a response)` : ""}</h2>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="space-y-2 rounded-lg border bg-card p-3 text-sm">
            <p><span className="font-medium">{a.purpose}</span> took {a.room} on {a.when} (booked by {a.bookedBy}).</p>
            {a.status === "PENDING" ? (
              asking === a.id ? (
                <div className="space-y-2">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What would work better? For example another room or time." maxLength={500} rows={2} autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={pending || !note.trim()} onClick={() => respond(a.id, "ALTERNATIVE_REQUESTED")}>Send request</Button>
                    <Button size="sm" variant="outline" onClick={() => setAsking(null)}>Back</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={pending} onClick={() => respond(a.id, "ACKNOWLEDGED")}><CheckCircle className="size-4" /> Acknowledge</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => setAsking(a.id)}>Request alternative</Button>
                </div>
              )
            ) : (
              <p className="text-[13px] text-muted-foreground">{a.status === "ACKNOWLEDGED" ? "You acknowledged this change." : `You asked for an alternative: "${a.note}"`}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
