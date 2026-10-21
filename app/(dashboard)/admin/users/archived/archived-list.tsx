"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/ux/action-button";
import { NativeSelect } from "@/components/ux/native-select";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { EmptyState } from "@/components/ux/states";
import { restoreRecordAction } from "@/actions/archive";
import { ARCHIVE_KINDS, ARCHIVE_LABELS } from "@/lib/archive/kinds";
import type { ArchivedRow } from "@/lib/archive/list";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

export function ArchivedList({ rows }: { rows: ArchivedRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [department, setDepartment] = useState("");
  const [pending, startTransition] = useTransition();

  const departments = useMemo(() => [...new Set(rows.map((r) => r.department))].sort(), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!department || r.department === department) &&
        (!q || [r.name, r.detail, r.reason, r.archivedBy].some((v) => v.toLowerCase().includes(q))),
    );
  }, [rows, query, kind, department]);
  const paging = usePagination(filtered, 15, `${query}|${kind}|${department}`);

  function restore(r: ArchivedRow) {
    startTransition(async () => {
      const res = await restoreRecordAction(r.kind, r.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, reason, or archived by" aria-label="Search archived records" className="h-9 w-full sm:w-72" />
        <NativeSelect aria-label="Record type" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="All record types" options={ARCHIVE_KINDS.map((k) => ({ value: k, label: ARCHIVE_LABELS[k] }))} className="w-full sm:w-48" />
        <NativeSelect aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="All departments" options={departments.map((d) => ({ value: d, label: d }))} className="w-full sm:w-64" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No archived records" description={rows.length ? "Nothing matches these filters." : "Archived accounts, subjects, rooms, and sections appear here."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Date Archived</TableHead>
                <TableHead>Archived By</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paging.visible.map((r) => (
                <TableRow key={`${r.kind}-${r.id}`}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary">{ARCHIVE_LABELS[r.kind]}</Badge></TableCell>
                  <TableCell>{r.kind === "USER" ? r.detail : "Not applicable"}</TableCell>
                  <TableCell>{r.department}</TableCell>
                  <TableCell className="whitespace-nowrap">{when(r.archivedAt)}</TableCell>
                  <TableCell>{r.archivedBy}</TableCell>
                  <TableCell className="max-w-xs text-muted-foreground">{r.reason || "No reason given"}</TableCell>
                  <TableCell className="text-right">
                    <ActionButton kind="restore" disabled={pending} onClick={() => restore(r)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination {...paging} />
    </div>
  );
}
