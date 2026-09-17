"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Check, X, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createRequestAction, reviewRequestAction } from "./actions";

interface Row {
  id: string;
  type: string;
  status: string;
  reason: string;
  reviewNote: string;
  requestedByName: string;
  reviewedByName: string;
  scheduleLabel: string;
  createdAt: string;
}

const TYPES = [
  { value: "NEW_SCHEDULE", label: "New Schedule" },
  { value: "CHANGE_TIME", label: "Change Time" },
  { value: "CHANGE_ROOM", label: "Change Room" },
  { value: "CHANGE_FACULTY", label: "Change Faculty" },
  { value: "CANCEL_SCHEDULE", label: "Cancel Schedule" },
];

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "APPROVED" || s === "COMPLETED") return "default";
  if (s === "REJECTED") return "destructive";
  return "secondary";
}

export function RequestsManager({
  requests,
  schedules,
  isStaff,
}: {
  requests: Row[];
  schedules: { id: string; label: string }[];
  isStaff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createRequestAction(formData);
      if (res.ok) {
        toast.success("Request submitted.");
        setOpen(false);
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  function handleReview(id: string, status: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      await reviewRequestAction(id, status);
      toast.success(`Request ${status.toLowerCase()}.`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="size-4" /> New Request
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Submit Schedule Request</DialogTitle>
            </DialogHeader>
            <form action={handleCreate}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="type">Request Type</FieldLabel>
                  <select name="type" id="type" required className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="scheduleId">Related Schedule (optional)</FieldLabel>
                  <select name="scheduleId" id="scheduleId" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">None</option>
                    {schedules.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="reason">Details</FieldLabel>
                  <textarea
                    name="reason"
                    id="reason"
                    required
                    rows={3}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </Field>
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Submit Request
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Status</TableHead>
              {isStaff && <TableHead className="w-40" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={isStaff ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                  No requests yet.
                </TableCell>
              </TableRow>
            )}
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.type.replace(/_/g, " ")}</TableCell>
                <TableCell>{r.scheduleLabel}</TableCell>
                <TableCell>{r.requestedByName}</TableCell>
                <TableCell className="max-w-xs truncate" title={r.reason}>{r.reason}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </TableCell>
                {isStaff && (
                  <TableCell>
                    {r.status === "PENDING" && (
                      <div className="flex gap-1">
                        <Button size="icon-sm" variant="outline" onClick={() => handleReview(r.id, "APPROVED")} disabled={pending}>
                          <Check className="size-4" />
                        </Button>
                        <Button size="icon-sm" variant="outline" onClick={() => handleReview(r.id, "REJECTED")} disabled={pending}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
