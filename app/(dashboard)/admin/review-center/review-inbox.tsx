"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, XCircle, NotePencil, UploadSimple } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bulkReviewAction } from "./actions";

export type ReviewKind = "CLASS_SCHEDULE" | "EXAMINATION" | "SCHEDULE_REQUEST" | "ACTIVITY_PROPOSAL" | "WORKLOAD_FIX" | "READ_ONLY";
export interface ReviewRow { id: string; kind: ReviewKind; title: string; detail: string; department: string; level: string; requester: string; date: string; status: string; href: string; }
export interface ReviewTab { key: string; label: string; count: number; }

export function ReviewInbox({ rows, tabs, active }: { rows: ReviewRow[]; tabs: ReviewTab[]; active: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const actionable = useMemo(() => rows.filter((row) => row.kind !== "READ_ONLY"), [rows]);
  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const oneKind = selectedRows.length > 0 && selectedRows.every((row) => row.kind === selectedRows[0].kind) && selectedRows[0].kind !== "READ_ONLY";

  function decide(decision: "APPROVE" | "PUBLISH" | "REJECT" | "REQUEST_CHANGES") {
    if (!oneKind) return void toast.error("Select reviewable items from one queue.");
    const reason = decision === "APPROVE" || decision === "PUBLISH" ? undefined : window.prompt(decision === "REJECT" ? "Reason for rejection (required)" : "Describe the required changes");
    if (decision !== "APPROVE" && decision !== "PUBLISH" && !reason?.trim()) return;
    startTransition(async () => {
      const result = await bulkReviewAction({ kind: selectedRows[0].kind as Exclude<ReviewKind, "READ_ONLY">, ids: selected, decision, reason: reason ?? undefined });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`${result.count} item${result.count === 1 ? "" : "s"} reviewed.`);
      setSelected([]);
      router.refresh();
    });
  }

  return <div className="space-y-4">
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => <Button key={tab.key} size="sm" variant={active === tab.key ? "default" : "outline"} nativeButton={false} render={<Link href={`/admin/review-center?queue=${tab.key}`} />}>
        {tab.label} <Badge variant={active === tab.key ? "secondary" : "outline"}>{tab.count}</Badge>
      </Button>)}
    </div>
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!oneKind || pending} onClick={() => decide("APPROVE")}><CheckCircle className="size-4" /> Approve selected</Button>
          {(active === "class-schedules" || active === "examinations") && <Button size="sm" disabled={!oneKind || pending} onClick={() => decide("PUBLISH")}><UploadSimple className="size-4" /> Approve and publish</Button>}
          <Button size="sm" variant="outline" disabled={!oneKind || pending} onClick={() => decide("REQUEST_CHANGES")}><NotePencil className="size-4" /> Request changes</Button>
          <Button size="sm" variant="destructive" disabled={!oneKind || pending} onClick={() => decide("REJECT")}><XCircle className="size-4" /> Reject selected</Button>
          <span className="text-xs text-muted-foreground">{selected.length} selected. Rejections and corrections require a reason and are audited.</span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10"><Checkbox aria-label="Select all reviewable items" checked={actionable.length > 0 && actionable.every((row) => selected.includes(row.id))} onCheckedChange={(checked) => setSelected(checked ? actionable.map((row) => row.id) : [])} /></TableHead>
              <TableHead>Item</TableHead><TableHead>Department and level</TableHead><TableHead>Requester</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!rows.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No items match this queue and filter.</TableCell></TableRow>}
              {rows.map((row) => <TableRow key={`${row.kind}-${row.id}`}>
                <TableCell><Checkbox aria-label={`Select ${row.title}`} disabled={row.kind === "READ_ONLY"} checked={selected.includes(row.id)} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /></TableCell>
                <TableCell><Link href={row.href} className="font-medium hover:underline">{row.title}</Link><p className="max-w-xl text-xs text-muted-foreground">{row.detail}</p></TableCell>
                <TableCell>{row.department}<p className="text-xs text-muted-foreground">{row.level}</p></TableCell>
                <TableCell>{row.requester}</TableCell><TableCell className="whitespace-nowrap">{row.date}</TableCell><TableCell><Badge variant={row.status.includes("Pending") || row.status.includes("review") ? "secondary" : "outline"}>{row.status}</Badge></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </div>;
}