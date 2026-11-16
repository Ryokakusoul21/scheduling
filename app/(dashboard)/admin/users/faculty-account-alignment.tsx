"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, DotsThree, MagnifyingGlass, Plus } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FacultyAccountRecord } from "@/lib/admin/faculty-alignment";
import { cn } from "@/lib/utils";
import { BulkAccounts } from "./bulk-accounts";
import { approveUserAction, changeEmailAction, createFacultyAccountAction, resetPasswordAction, setAccountStatusAction } from "./actions";

type Account = NonNullable<FacultyAccountRecord["account"]>;

/** One status per row: no account, archived, or the login status. */
function statusOf(f: FacultyAccountRecord) {
  if (!f.account) return "NONE";
  return f.account.archived ? "ARCHIVED" : f.account.status;
}

const STATUS_LABEL: Record<string, string> = { NONE: "No account", ACTIVE: "Active", SUSPENDED: "Suspended", PENDING: "Pending", INACTIVE: "Inactive", ARCHIVED: "Archived" };
const STATUS_STYLE: Record<string, string> = {
  NONE: "border-dashed text-muted-foreground",
  ACTIVE: "border-emerald-600/25 bg-emerald-600/5 text-emerald-800 dark:text-emerald-300",
  PENDING: "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200",
};

/** The Registrar's faculty roster is the user list: one row per faculty member with their login. */
export function FacultyAccountAlignment({ faculty, onReview }: { faculty: FacultyAccountRecord[]; onReview: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [creating, setCreating] = useState<FacultyAccountRecord | null>(null);
  const [emailFor, setEmailFor] = useState<Account | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const departments = [...new Map(faculty.filter((f) => f.departmentId).map((f) => [f.departmentId!, f.departmentName ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const inDepartment = faculty.filter((f) => department === "ALL" || f.departmentId === department);
  const counts = { ALL: inDepartment.length, PENDING: 0, NONE: 0, ACTIVE: 0, SUSPENDED: 0 } as Record<string, number>;
  for (const f of inDepartment) { const s = statusOf(f); if (s in counts) counts[s]++; }
  const q = query.trim().toLowerCase();
  const rows = inDepartment.filter((f) => (filter === "ALL" || statusOf(f) === filter) &&
    (!q || [f.fullName, f.employeeId, f.account?.email ?? "", f.departmentName ?? ""].some((s) => s.toLowerCase().includes(q))));
  const paging = usePagination(rows, 15, `${query}|${filter}|${department}`);

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => {
    const res = await task();
    if (res.ok) toast.success(done); else toast.error(res.error ?? "Something went wrong.");
  });
  const reset = (a: Account) => start(async () => {
    const res = await resetPasswordAction(a.id);
    setIssued({ email: a.email, password: res.password });
  });

  return <section className="space-y-3 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">Faculty accounts</h2>
      <div className="flex items-center gap-3"><Link className="text-xs text-primary hover:underline" href="/faculty">Edit roster</Link><BulkAccounts faculty={faculty} /></div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-60 flex-1"><MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input aria-label="Search faculty" placeholder="Search name, employee ID, email" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <NativeSelect aria-label="Filter by department" className="sm:w-64" value={department} onChange={(e) => setDepartment(e.target.value)} options={[{ value: "ALL", label: "All departments" }, ...departments.map(([value, label]) => ({ value, label }))]} />
      <div role="group" aria-label="Account status" className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
        {(["ALL", "PENDING", "NONE", "ACTIVE", "SUSPENDED"] as const).filter((s) => s !== "PENDING" || counts.PENDING > 0 || filter === "PENDING").map((s) => <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
          className={cn("rounded-md px-3 py-1.5 text-xs font-medium", filter === s ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {s === "ALL" ? "All" : STATUS_LABEL[s]}<span className="ml-1.5 tabular-nums opacity-70">{counts[s]}</span></button>)}
      </div>
    </div>
    <div className="overflow-x-auto">
      <Table><TableHeader><TableRow><TableHead>Faculty</TableHead><TableHead>Department</TableHead><TableHead>Login email</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{paging.visible.map((f) => { const s = statusOf(f); const a = f.account; return <TableRow key={f.id}>
          <TableCell><p className="font-medium">{f.fullName}</p><p className="text-xs text-muted-foreground">{f.employeeId}</p></TableCell>
          <TableCell className="text-sm">{f.departmentName}</TableCell>
          <TableCell className="text-sm">{a?.email}</TableCell>
          <TableCell><Badge variant="outline" className={cn(STATUS_STYLE[s] ?? "border-destructive/25 text-destructive")}>{STATUS_LABEL[s] ?? s}</Badge></TableCell>
          <TableCell><div className="flex justify-end gap-1.5">
            {a && !a.archived && a.status === "PENDING" && (a.emailVerified
              ? <Button size="sm" disabled={pending} onClick={() => run(() => approveUserAction(a.id), "Account approved.")}><Check className="size-3.5" />Approve</Button>
              : <span className="self-center text-xs text-muted-foreground">Awaiting email verification</span>)}
            {!a ? <Button size="sm" disabled={pending} onClick={() => { setError(null); setCreating(f); }}><Plus className="size-3.5" />Create account</Button>
              : a.archived ? <Link className="text-xs text-primary hover:underline" href="/admin/users/archived">Archived</Link>
              : <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Actions for ${f.fullName}`} />}><DotsThree className="size-5" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuItem onClick={() => reset(a)}>Reset password</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setError(null); setEmailFor(a); }}>Change email</DropdownMenuItem>
                  {a.status === "SUSPENDED"
                    ? <DropdownMenuItem onClick={() => run(() => setAccountStatusAction(a.id, "ACTIVE"), "Account reactivated.")}>Reactivate</DropdownMenuItem>
                    : <DropdownMenuItem variant="destructive" onClick={() => run(() => setAccountStatusAction(a.id, "SUSPENDED"), "Account suspended.")}>Suspend</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => onReview(a.id)}>Edit role and details</DropdownMenuItem>
                </DropdownMenuContent></DropdownMenu>}
          </div></TableCell>
        </TableRow>; })}
        {!rows.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No matches</TableCell></TableRow>}</TableBody>
      </Table>
    </div>
    <Pagination {...paging} />

    {creating && <Dialog open onOpenChange={(open) => !open && !pending && setCreating(null)}><DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Create account</DialogTitle><DialogDescription>{creating.fullName} · {creating.employeeId}</DialogDescription></DialogHeader>
      <form className="space-y-3" action={(fd) => start(async () => {
        setError(null);
        const email = String(fd.get("email") ?? "");
        const res = await createFacultyAccountAction(creating.id, email, fd.get("role") === "HEAD_OF_DEPARTMENT" ? "HEAD_OF_DEPARTMENT" : "FACULTY");
        if (res.ok) { setCreating(null); setIssued({ email: email.trim().toLowerCase(), password: res.password }); } else setError(res.error ?? "Could not create the account.");
      })}>
        <Input name="email" type="email" required autoFocus placeholder="name@gmail.com" aria-label="Gmail" />
        <NativeSelect name="role" aria-label="Role" defaultValue="FACULTY" options={[{ value: "FACULTY", label: "Faculty" }, { value: "HEAD_OF_DEPARTMENT", label: "Head of Department" }]} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>Create and generate password</Button>
      </form>
    </DialogContent></Dialog>}

    {emailFor && <Dialog open onOpenChange={(open) => !open && !pending && setEmailFor(null)}><DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Change email</DialogTitle><DialogDescription>{emailFor.name}</DialogDescription></DialogHeader>
      <form className="space-y-3" action={(fd) => start(async () => {
        setError(null);
        const res = await changeEmailAction(emailFor.id, String(fd.get("email") ?? ""));
        if (res.ok) { toast.success("Email changed."); setEmailFor(null); } else setError(res.error ?? "Could not change the email.");
      })}>
        <Input name="email" type="email" required autoFocus defaultValue={emailFor.email} aria-label="New email" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>Save</Button>
      </form>
    </DialogContent></Dialog>}

    {issued && <Dialog open onOpenChange={(open) => !open && setIssued(null)}><DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Login details</DialogTitle><DialogDescription>Shown once. Password change required on first login.</DialogDescription></DialogHeader>
      <div className="space-y-1 rounded-lg bg-muted/60 p-3 font-mono text-sm"><p>{issued.email}</p><p className="font-semibold">{issued.password}</p></div>
      <Button onClick={() => { navigator.clipboard.writeText(`Email: ${issued.email}\nPassword: ${issued.password}`).then(() => toast.success("Copied.")); }}><Copy className="size-4" />Copy login</Button>
    </DialogContent></Dialog>}
  </section>;
}
