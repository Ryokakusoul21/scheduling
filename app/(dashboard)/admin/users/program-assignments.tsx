"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assignProgramAction, removeProgramAssignmentAction } from "./program-actions";

export interface ProgramOption { id: string; label: string }
export interface AssignmentRow { id: string; programId: string; label: string; isActing: boolean; startDate: string; endDate: string | null }

const inputClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/** Registrar dialog: limits a Head of Department to specific programs or strands. No active row means the whole department. */
export function ProgramAssignments({ userId, name, options, rows, onClose }: { userId: string; name: string; options: ProgramOption[]; rows: AssignmentRow[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await assignProgramAction({
        userId,
        programId: String(formData.get("programId") ?? ""),
        isActing: formData.get("isActing") === "on",
        startDate: String(formData.get("startDate") || new Date().toISOString().slice(0, 10)),
        endDate: formData.get("endDate") ? String(formData.get("endDate")) : null,
      });
      if (res.ok) toast.success("Program assignment saved.");
      else setError(res.error ?? "Could not save the assignment.");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeProgramAssignmentAction(id);
      if (res.ok) toast.success("Program assignment removed.");
      else toast.error(res.error ?? "Could not remove the assignment.");
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Program Assignments for {name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">With no active assignment, the Head of Department handles every program of their department. Active assignments limit access to only those programs.</p>
        <ul className="space-y-1.5">
          {rows.length === 0 && <li className="text-sm text-muted-foreground">No assignments: whole department.</li>}
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{r.label}</span>{" "}
                {r.isActing && <Badge variant="secondary">Acting</Badge>}
                <span className="block text-xs text-muted-foreground">{r.startDate} to {r.endDate ?? "no end date"}</span>
              </span>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => remove(r.id)}>Remove</Button>
            </li>
          ))}
        </ul>
        <form action={add} className="grid gap-2 sm:grid-cols-2">
          <select name="programId" required aria-label="Program" className={`${inputClass} sm:col-span-2`}>
            <option value="">Select a program or strand</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <label className="grid gap-1 text-xs">Start date<input type="date" name="startDate" className={inputClass} /></label>
          <label className="grid gap-1 text-xs">End date (optional)<input type="date" name="endDate" className={inputClass} /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isActing" /> Acting assignment</label>
          {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
          <Button type="submit" disabled={pending} className="sm:col-span-2">Save Assignment</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
