"use client";

import { useCallback, useRef, useState } from "react";
import { Warning } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Asks the Head of Department for a reason to submit while faculty loads are out of range; resolves to the reason or null. */
export function useWorkloadOverride() {
  const [issues, setIssues] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<(value: string | null) => void>(() => {});

  const prompt = useCallback((list: string[]) => {
    setReason("");
    setIssues(list);
    return new Promise<string | null>((resolve) => (resolver.current = resolve));
  }, []);

  const close = (value: string | null) => {
    resolver.current(value);
    setIssues(null);
  };

  const dialog = (
    <Dialog open={!!issues} onOpenChange={(open) => !open && close(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Faculty loads are not balanced</DialogTitle>
          <DialogDescription>Approve or fix the workload proposals first, or submit anyway with a reason. The override is recorded in the Audit Logs.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
          {issues?.map((i) => <li key={i} className="flex gap-2"><Warning className="mt-0.5 size-4 shrink-0 text-warning" />{i}</li>)}
        </ul>
        <label htmlFor="workload-override-reason" className="text-sm font-medium">Reason for submitting anyway</label>
        <Textarea id="workload-override-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} required />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(null)}>Go back</Button>
          <Button disabled={!reason.trim()} onClick={() => close(reason.trim())}>Submit with override</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { prompt, dialog };
}
