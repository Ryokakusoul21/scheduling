"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { archiveRecordAction } from "@/actions/archive";
import { toCsv } from "@/lib/subjects/status";
import type { CurriculumRow } from "./types";

/** Appears when rows are selected: assign faculty, archive, or export the selection. */
export function BulkBar({ rows, canAssign, onAssign, onClear, onDone }: { rows: CurriculumRow[]; canAssign: boolean; onAssign: () => void; onClear: () => void; onDone: () => void }) {
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  function exportCsv() {
    const csv = toCsv(
      ["Code", "Subject", "Category", "Units", "Hours per week", "Assigned faculty", "Managed by"],
      rows.map((r) => [r.code, r.name, r.category === "MAJOR" ? "Major" : "Minor / General Education", r.units, r.lectureHours + r.labHours, [...new Set(r.assignments.map((a) => a.facultyName))].join("; "), r.departmentName ?? "General Education"]),
    );
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "subjects.csv" }).click();
    URL.revokeObjectURL(url);
  }

  function archive() {
    start(async () => {
      let done = 0;
      const skipped: string[] = [];
      for (const r of rows) {
        const res = await archiveRecordAction({ kind: "SUBJECT", id: r.id, reason, confirmed: false });
        if (res.ok) done += 1;
        else skipped.push(r.code);
      }
      if (done) toast.success(`${done} subject${done > 1 ? "s" : ""} archived.`);
      if (skipped.length) toast.warning(`${skipped.join(", ")} still ${skipped.length > 1 ? "have" : "has"} classes this term. Archive ${skipped.length > 1 ? "them" : "it"} one at a time to confirm.`);
      setArchiving(false);
      setReason("");
      onDone();
    });
  }

  return (
    <div role="region" aria-label="Bulk actions" className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t bg-card p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)]">
      <p aria-live="polite" className="mr-auto text-sm font-medium">{rows.length} selected</p>
      {canAssign && <Button size="sm" onClick={onAssign}>Assign faculty</Button>}
      <Button size="sm" variant="outline" onClick={exportCsv}>Export</Button>
      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setArchiving(true)}>Archive</Button>
      <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>

      <Dialog open={archiving} onOpenChange={(o) => !pending && setArchiving(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {rows.length} subject{rows.length > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>{rows.map((r) => r.code).join(", ")}. They can be restored from Archived records.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm font-medium">Reason (optional)<Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} /></label>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setArchiving(false)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={archive}>{pending ? "Archiving..." : "Archive"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
