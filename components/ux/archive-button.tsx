"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Warning } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ux/action-button";
import { archiveRecordAction } from "@/actions/archive";
import { ARCHIVE_CONFIRM_TEXT, ARCHIVE_LABELS, type ArchiveKind } from "@/lib/archive/kinds";

/** Archive action for any archivable record: optional reason, then a warning when classes this term still use it. */
export function ArchiveButton({ kind, id, name, onDone }: { kind: ArchiveKind; id: string; name: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [classes, setClasses] = useState<{ list: string[]; teaching: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setClasses(null);
    setReason("");
  }

  function submit(confirmed: boolean) {
    startTransition(async () => {
      const res = await archiveRecordAction({ kind, id, reason, confirmed });
      if (res.ok) {
        toast.success(res.message);
        close();
        onDone?.();
      } else if ("classes" in res) setClasses({ list: res.classes, teaching: res.teaching });
      else toast.error(res.error);
    });
  }

  return (
    <>
      <ActionButton kind="archive" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {ARCHIVE_LABELS[kind].toLowerCase()} &ldquo;{name}&rdquo;?</DialogTitle>
            <DialogDescription>{ARCHIVE_CONFIRM_TEXT}</DialogDescription>
          </DialogHeader>

          {classes ? (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <Warning className="size-4 text-amber-600" aria-hidden /> Still used by {classes.list.length} class meeting(s) this term
              </p>
              <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
                {classes.list.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <p className="text-muted-foreground">
                {classes.teaching
                  ? "Archiving runs workload balancing so these classes are reassigned to qualified, free faculty members (proposals need approval unless automatic mode is on)."
                  : "These classes stay on record. Move them in the Scheduler if they should continue."}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor={`reason-${id}`} className="text-sm font-medium">Reason (optional)</label>
              <Textarea id={`reason-${id}`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="For example: Resigned at the end of the semester" />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending}>Cancel</Button>
            <Button variant="destructive" onClick={() => submit(!!classes)} disabled={pending}>
              {classes ? (classes.teaching ? "Archive and reassign classes" : "Archive anyway") : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
