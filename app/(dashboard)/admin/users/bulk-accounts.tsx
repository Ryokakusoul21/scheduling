"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ux/native-select";
import { parseDelimited } from "@/lib/import/parse";
import { downloadText, toCsv } from "@/lib/export/csv";
import type { FacultyAccountRecord } from "@/lib/admin/faculty-alignment";
import { createFacultyAccountsBulkAction, type BulkAccountResult, type BulkAccountRow } from "./actions";

const TEMPLATE = "Employee ID,Gmail,Role\r\nGC-300001,juan.delacruz@gmail.com,Faculty\r\n";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Checked = BulkAccountRow & { line: number; issue?: string };

/** Maps a role cell to its stored value; blank means Faculty. */
function roleOf(text: string) {
  const t = text.trim().toLowerCase().replace(/[\s_]+/g, " ");
  if (!t || t === "faculty") return "FACULTY";
  return t === "head of department" ? "HEAD_OF_DEPARTMENT" : "";
}

/** Parses the pasted or uploaded table and checks every row against the roster. */
export function checkRows(text: string, faculty: FacultyAccountRecord[], departmentId?: string): Checked[] {
  const rows = parseDelimited(text);
  if (/^\s*employee/i.test(rows[0]?.[0] ?? "")) rows.shift();
  const roster = new Map(faculty.map((f) => [f.employeeId.toLowerCase(), f]));
  const seenIds = new Set<string>(), seenEmails = new Set<string>();
  return rows.map((r, i) => {
    const employeeId = (r[0] ?? "").trim(), email = (r[1] ?? "").trim().toLowerCase(), role = roleOf(r[2] ?? "");
    const f = roster.get(employeeId.toLowerCase());
    const issue = !employeeId ? "Missing employee ID" : !f ? "Not on roster" : departmentId && f.departmentId !== departmentId ? "Other department" : f.account ? "Already has an account"
      : !EMAIL.test(email) ? "Invalid email" : !role ? "Role must be Faculty or Head of Department"
      : seenIds.has(employeeId.toLowerCase()) ? "Duplicate employee ID" : seenEmails.has(email) ? "Duplicate email" : undefined;
    seenIds.add(employeeId.toLowerCase()); seenEmails.add(email);
    return { line: i + 1, employeeId, email, role, issue };
  });
}

export function BulkAccounts({ faculty }: { faculty: FacultyAccountRecord[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [results, setResults] = useState<BulkAccountResult[] | null>(null);
  const [pending, start] = useTransition();
  const rows = text.trim() && departmentId ? checkRows(text, faculty, departmentId) : [];
  const ready = rows.filter((r) => !r.issue);
  const issues = rows.filter((r) => r.issue);
  const created = results?.filter((r) => r.ok) ?? [];
  const failed = results?.filter((r) => !r.ok) ?? [];
  const names = new Map(faculty.map((f) => [f.employeeId.toLowerCase(), f.fullName]));
  const departments = [...new Map(faculty.filter((f) => f.departmentId).map((f) => [f.departmentId!, f.departmentName ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const departmentName = departments.find(([id]) => id === departmentId)?.[1] ?? "";

  const close = () => { if (pending) return; setOpen(false); setText(""); setResults(null); setDepartmentId(""); };
  const submit = () => start(async () => {
    const res = await createFacultyAccountsBulkAction(departmentId, ready.map(({ employeeId, email, role }) => ({ employeeId, email, role })));
    if (res.ok) setResults(res.results); else toast.error(res.error);
  });
  const downloadLogins = () => downloadText(`faculty-logins-${departmentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, toCsv(created, [
    { header: "Name", value: (r) => names.get(r.employeeId.toLowerCase()) },
    { header: "Employee ID", value: (r) => r.employeeId },
    { header: "Department", value: () => departmentName },
    { header: "Email", value: (r) => r.email },
    { header: "Temporary password", value: (r) => (r.ok ? r.password : "") },
  ]));

  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><UploadSimple className="size-4" />Bulk create</Button>
    {open && <Dialog open onOpenChange={(o) => !o && close()}><DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Bulk create accounts</DialogTitle><DialogDescription>Employee ID, Gmail, Role (optional)</DialogDescription></DialogHeader>
      {!results ? <div className="space-y-3">
        <NativeSelect aria-label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} placeholder="Choose department" options={departments.map(([value, label]) => ({ value, label }))} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" nativeButton={false} render={<label />}><UploadSimple className="size-4" />Upload CSV
            <input type="file" accept=".csv,.txt" className="sr-only" onChange={(e) => e.target.files?.[0]?.text().then(setText)} /></Button>
          <Button size="sm" variant="ghost" onClick={() => downloadText("faculty-accounts-template.csv", TEMPLATE)}><DownloadSimple className="size-4" />Template</Button>
        </div>
        <textarea aria-label="Paste rows" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="GC-300001, name@gmail.com, Faculty"
          className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs" />
        {rows.length > 0 && <div className="flex gap-2 text-xs"><Badge variant="secondary">{ready.length} ready</Badge>{issues.length > 0 && <Badge variant="outline" className="border-destructive/30 text-destructive">{issues.length} with issues</Badge>}</div>}
        {issues.length > 0 && <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">{issues.map((r) => <li key={r.line} className="flex justify-between gap-3"><span className="font-mono">{r.employeeId || `Row ${r.line}`}</span><span className="text-destructive">{r.issue}</span></li>)}</ul>}
        <Button className="w-full" disabled={pending || !departmentId || !ready.length} onClick={submit}>{pending ? "Creating…" : `Create ${ready.length} accounts`}</Button>
      </div> : <div className="space-y-3">
        <div className="flex gap-2 text-xs"><Badge variant="secondary">{created.length} created</Badge><Badge variant="outline">{departmentName}</Badge>{failed.length > 0 && <Badge variant="outline" className="border-destructive/30 text-destructive">{failed.length} failed</Badge>}</div>
        {failed.length > 0 && <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">{failed.map((r) => <li key={r.employeeId} className="flex justify-between gap-3"><span className="font-mono">{r.employeeId}</span><span className="text-destructive">{r.ok ? "" : r.error}</span></li>)}</ul>}
        {created.length > 0 && <Button className="w-full" onClick={downloadLogins}><DownloadSimple className="size-4" />Download logins</Button>}
        <p className="text-xs text-muted-foreground">Passwords shown once. Change required on first login.</p>
      </div>}
    </DialogContent></Dialog>}
  </>;
}
