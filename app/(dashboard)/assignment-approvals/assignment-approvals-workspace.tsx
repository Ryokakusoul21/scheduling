"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState } from "@/components/ux/states";
import { ConflictAlert } from "@/components/ux/conflict";
import { reviewAssignmentProposalAction } from "@/app/(dashboard)/subjects/assignment-proposal-actions";

export type AssignmentProposalRow = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  subjectCode: string;
  subjectName: string;
  sectionName: string;
  termLabel: string;
  facultyName: string;
  facultyDepartment: string;
  reviewDepartment: string;
  requestedBy: string;
  reviewedBy: string;
  currentFaculty: string | null;
  decisionNote: string;
  createdAt: string;
  reviewWarnings: string[];
  canReview: boolean;
};

const STATUS_LABEL: Record<AssignmentProposalRow["status"], string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-PH", {
  year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila",
});

export function AssignmentApprovalsWorkspace({ rows }: { rows: AssignmentProposalRow[] }) {
  const router = useRouter();
  const [status, setStatus] = useState("PENDING");
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState<{ row: AssignmentProposalRow; value: "APPROVED" | "REJECTED" } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) =>
      (status === "ALL" || row.status === status) &&
      (!q || `${row.subjectCode} ${row.subjectName} ${row.sectionName} ${row.facultyName} ${row.requestedBy} ${row.reviewDepartment}`.toLowerCase().includes(q)),
    );
  }, [rows, status, query]);
  const pendingCount = rows.filter((row) => row.status === "PENDING").length;

  function submitDecision() {
    if (!decision) return;
    setError(null);
    start(async () => {
      const result = await reviewAssignmentProposalAction({
        proposalId: decision.row.id,
        decision: decision.value,
        note: note.trim() || undefined,
      });
      if (!result.ok) return setError(result.error);
      toast.success(`Assignment proposal ${decision.value === "APPROVED" ? "approved" : "rejected"}.`);
      result.warnings.forEach((warning) => toast.warning(warning));
      setDecision(null);
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="assignment-proposal-search">Search proposals</label>
        <Input id="assignment-proposal-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject, faculty, or department" className="h-10 w-full sm:max-w-sm" />
        <NativeSelect
          aria-label="Proposal status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={[
            { value: "PENDING", label: `Pending (${pendingCount})` },
            { value: "ALL", label: "All statuses" },
            { value: "APPROVED", label: "Approved" },
            { value: "REJECTED", label: "Rejected" },
          ]}
        />
        <p aria-live="polite" className="ml-auto text-sm text-muted-foreground">{shown.length} proposals</p>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={rows.length ? "No proposals match these filters" : "No assignment proposals"}
          description={rows.length ? "Try another search or status." : "New proposals from faculty departments will appear here."}
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => (
            <li key={row.id}>
              <Card className="gap-3 p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{row.subjectCode} · {row.subjectName}</h2>
                    <p className="text-sm text-muted-foreground">{row.sectionName} · {row.termLabel}</p>
                  </div>
                  <Badge variant={row.status === "PENDING" ? "secondary" : "outline"}>{STATUS_LABEL[row.status]}</Badge>
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-muted-foreground">Proposed faculty</dt><dd className="font-medium">{row.facultyName} · {row.facultyDepartment}</dd></div>
                  {row.status === "PENDING" && <div><dt className="text-muted-foreground">Current faculty</dt><dd>{row.currentFaculty ?? "Unassigned"}</dd></div>}
                  <div><dt className="text-muted-foreground">Submitted by</dt><dd>{row.requestedBy} · {dateLabel(row.createdAt)}</dd></div>
                  {row.status !== "PENDING" && <div><dt className="text-muted-foreground">Reviewed by</dt><dd>{row.reviewedBy || "Administrator"}</dd></div>}
                  {row.decisionNote && <div className="sm:col-span-2"><dt className="text-muted-foreground">Decision note</dt><dd>{row.decisionNote}</dd></div>}
                </dl>
                {row.reviewWarnings.length > 0 && <ConflictAlert severity="warning" title="Review workload and availability" items={row.reviewWarnings} />}
                {row.status === "PENDING" && row.canReview && (
                  <div className="flex justify-end gap-2 border-t pt-3">
                    <Button variant="outline" onClick={() => { setDecision({ row, value: "REJECTED" }); setNote(""); setError(null); }}>Reject</Button>
                    <Button onClick={() => { setDecision({ row, value: "APPROVED" }); setNote(""); setError(null); }}>Approve assignment</Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!decision} onOpenChange={(open) => { if (!open && !busy) { setDecision(null); setNote(""); setError(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{decision?.value === "APPROVED" ? "Approve assignment?" : "Reject assignment proposal?"}</DialogTitle>
            <DialogDescription>
              {decision?.value === "APPROVED"
                ? `${decision.row.subjectCode} will become an active assignment for ${decision.row.facultyName}.`
                : `${decision?.row.subjectCode} will remain unassigned to the proposed faculty member.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label htmlFor="assignment-decision-note" className="text-sm font-medium">
              Decision note{decision?.value === "REJECTED" ? " (required)" : " (optional)"}
            </label>
            <Textarea id="assignment-decision-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDecision(null)}>Cancel</Button>
            <Button
              variant={decision?.value === "REJECTED" ? "destructive" : "default"}
              disabled={busy || (decision?.value === "REJECTED" && !note.trim())}
              onClick={submitDecision}
            >
              {busy ? "Saving..." : decision?.value === "APPROVED" ? "Approve assignment" : "Reject proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
