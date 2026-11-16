"use client";

import { ROLE_LABELS } from "@/lib/permissions/roles";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, CircleNotch as Loader2, DotsThree, MagnifyingGlass, WarningCircle, CheckCircle, Key, UserCircle, Archive, Clock, ArrowCounterClockwise, Copy } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ArchiveButton } from "@/components/ux/archive-button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { ProgramAssignments, type AssignmentRow, type ProgramOption } from "./program-assignments";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createUserAction, updateUserAction, resetPasswordAction, approveUserAction, removeUserAvatarAction } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AdminStatCards } from "@/components/admin/stat-cards";
import { accountSummary, filterAccounts, type AccountListRow } from "@/lib/admin/accounts";
import { cn } from "@/lib/utils";
import { FacultyAccountAlignment } from "./faculty-account-alignment";
import { facultyContactPending, type FacultyAccountRecord } from "@/lib/admin/faculty-alignment";

interface Row extends AccountListRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  facultyId: string | null;
  assignedDepartmentId: string | null;
  facultyDepartmentId?: string | null;
  image: string | null;
  createdAt: string;
  studentLabel: string | null;
  /** Programs of the head's own department that can be assigned, and the current assignments. */
  programOptions?: ProgramOption[];
  assignments?: AssignmentRow[];
}

/** Assigns an account to the department it belongs to; a Head of Department gains authority over it. */
function DepartmentField({ id, options, value }: { id: string; options: { value: string; label: string }[]; value?: string | null }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Assigned department</FieldLabel>
      <select name="departmentId" id={id} defaultValue={value ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">None (Registrar and Super Administrator accounts)</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">A head gains authority over the assigned department. One head per department.</p>
    </Field>
  );
}

// Student accounts come only from the student registration page.
const ROLES = Object.entries(ROLE_LABELS).filter(([value]) => value !== "STUDENT").map(([value, label]) => ({ value, label }));

export function UsersManager({ users, faculty, departments, allDepartments, viewerId }: { users: Row[]; faculty: FacultyAccountRecord[]; departments: { value: string; label: string }[]; allDepartments: { value: string; label: string }[]; viewerId: string }) {
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [resetRow, setResetRow] = useState<Row | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [programRow, setProgramRow] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveRow, setArchiveRow] = useState<Row | null>(null);
  const [createRole, setCreateRole] = useState("FACULTY");
  const [createFacultyId, setCreateFacultyId] = useState("");
  const teachingAccount = ["FACULTY", "HEAD_OF_DEPARTMENT"].includes(createRole);
  const createFaculty = faculty.find((f) => f.id === createFacultyId && !f.account);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [unlinked, setUnlinked] = useState(false);
  const [sort, setSort] = useState("NEWEST");
  const others = users.filter((u) => !u.facultyId);
  const summary = accountSummary(others);
  const facultyReviewCount = summary.unlinked + summary.archivedFacultyLinks;
  const filtered = filterAccounts(others, { query, role, status, department, unlinked }).sort((a, b) => sort === "NAME" ? a.name.localeCompare(b.name) : sort === "OLDEST" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const paging = usePagination(filtered, 15, `${query}|${role}|${status}|${department}|${unlinked}|${sort}`);
  const edit = (user: Row) => { setError(null); setEditRow(user); };
  const resetFilters = () => { setQuery(""); setRole("ALL"); setStatus("ALL"); setDepartment("ALL"); setUnlinked(false); setSort("NEWEST"); };

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createUserAction(formData);
      if (res.ok) {
        toast.success("User created.");
        setCreateOpen(false);
      } else setError(res.error ?? "Something went wrong.");
    });
  }

  function handleUpdate(formData: FormData) {
    if (!editRow) return;
    setError(null);
    startTransition(async () => {
      const res = await updateUserAction(editRow.id, formData);
      if (res.ok) {
        toast.success("User updated.");
        setEditRow(null);
      } else setError(res.error ?? "Something went wrong.");
    });
  }

  function handleReset() {
    if (!resetRow) return;
    startTransition(async () => {
      const res = await resetPasswordAction(resetRow.id);
      setIssued({ email: resetRow.email, password: res.password });
      setResetRow(null);
    });
  }

  function handleRemovePhoto(id: string) {
    startTransition(async () => {
      const res = await removeUserAvatarAction(id);
      if (res.ok) toast.success("Profile photo removed.");
      else toast.error(res.error ?? "Could not remove the photo.");
    });
  }

  function handleApprove(id: string) {
    startTransition(async () => {
      const res = await approveUserAction(id);
      if (res.ok) toast.success("Account approved. The user has been notified.");
      else toast.error(res.error ?? "Could not approve.");
    });
  }

  return (
    <div className="space-y-5" aria-busy={pending}>
      <AdminStatCards items={[
        { label: "Accounts", value: summary.total, hint: "All accounts outside the archive" },
        { label: "Active access", value: summary.active, hint: "Accounts currently marked active" },
        { label: "Awaiting approval", value: summary.pending, hint: "Review registration details before activation", attention: summary.pending > 0 },
        { label: "Restricted access", value: summary.restricted, hint: "Inactive or suspended accounts" },
      ]} />
      <FacultyAccountAlignment faculty={faculty} onReview={(id) => { const user = users.find((u) => u.id === id); if (user) edit(user); }} />
      {(summary.pending > 0 || facultyReviewCount > 0) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3"><div className="flex items-start gap-2.5"><WarningCircle className="mt-0.5 size-5 shrink-0 text-amber-600" /><div><p className="text-sm font-medium">Account review</p><p className="mt-1.5 flex flex-wrap gap-1.5 text-xs">{([[summary.pending, "pending approval"], [summary.unlinked, "without a faculty link"], [summary.archivedFacultyLinks, "linked to archived faculty"]] as const).filter(([count]) => count > 0).map(([count, label]) => <span key={label} className="rounded-full border border-amber-500/30 bg-background/70 px-2 py-0.5"><span className="font-semibold tabular-nums">{count}</span> {label}</span>)}</p></div></div><div className="flex flex-wrap gap-2">{summary.pending > 0 && <Button type="button" size="sm" variant="outline" onClick={() => { resetFilters(); setStatus("PENDING"); }}>Review requests</Button>}{facultyReviewCount > 0 && <Button type="button" size="sm" variant="outline" onClick={() => { resetFilters(); setUnlinked(true); }}>Review faculty links</Button>}</div></div>}
      <details className="group space-y-4 rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-base font-semibold">Other accounts <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{others.length}</span></summary>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <Dialog open={createOpen} onOpenChange={(open) => { if (!pending) { setCreateOpen(open); setError(null); if (open) setCreateRole("FACULTY"); } }}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="size-4" /> Create account
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Create account</DialogTitle><DialogDescription>Set up login access and choose the role this person needs. Student accounts are created through registration.</DialogDescription></DialogHeader>
            <form action={handleCreate} key={createRole}>
              <FieldGroup>
                {teachingAccount && <Field><FieldLabel htmlFor="create-faculty">Registrar faculty record</FieldLabel>
                  <NativeSelect id="create-faculty" name="facultyId" required value={createFacultyId} onChange={(e) => setCreateFacultyId(e.target.value)} placeholder="Choose a faculty member" options={faculty.filter((f) => !f.account).map((f) => ({ value: f.id, label: `${f.fullName} · ${f.employeeId}${facultyContactPending(f.email) ? " · contact details pending" : ""}` }))} />
                  <p className="text-xs text-muted-foreground">Names, contact email and department come from the Registrar’s faculty record.</p>
                </Field>}
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <input name="name" id="name" required {...(teachingAccount ? { value: createFaculty?.fullName ?? "", readOnly: true } : {})} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <input type="email" name="email" id="email" required {...(teachingAccount ? { value: createFaculty?.email ?? "", readOnly: true } : {})} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="role">Role</FieldLabel>
                  <select name="role" id="role" required value={createRole} onChange={(event) => setCreateRole(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                {teachingAccount ? <p className="text-sm">Faculty department: {createFaculty?.departmentName ?? "Choose a faculty record"}</p> : <DepartmentField id="department" options={allDepartments} />}
                {teachingAccount && createFaculty && facultyContactPending(createFaculty.email) && <p className="text-sm text-amber-700">Contact details are pending. Ask the Registrar to replace the temporary email in Faculty before creating login access.</p>}
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <input type="password" name="password" id="password" required minLength={8} placeholder="8+ chars, upper, lower, number, symbol" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </Field>
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" disabled={pending || (teachingAccount && (!createFaculty || facultyContactPending(createFaculty.email)))}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Create User
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="space-y-4">
        <div role="group" aria-label="Account status" className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">{[{ value: "ALL", label: "All accounts", count: summary.total }, { value: "PENDING", label: "Pending approval", count: summary.pending }, { value: "ACTIVE", label: "Active", count: summary.active }, { value: "RESTRICTED", label: "Inactive / suspended", count: summary.restricted }].map((item) => <button key={item.value} type="button" aria-pressed={status === item.value} onClick={() => setStatus(item.value)} className={cn("rounded-md px-3 py-2 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring", status === item.value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{item.label}<span className="ml-2 tabular-nums opacity-70">{item.count}</span></button>)}</div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1.8fr)_1fr_1.2fr_1fr]"><label className="relative"><MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden /><Input aria-label="Search user accounts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, faculty, or department…" className="pl-9" /></label><NativeSelect aria-label="Filter accounts by role" value={role} onChange={(event) => setRole(event.target.value)} options={[{ value: "ALL", label: "All roles" }, ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))]} /><NativeSelect aria-label="Filter accounts by department" value={department} onChange={(event) => setDepartment(event.target.value)} options={[{ value: "ALL", label: "All departments" }, { value: "UNASSIGNED", label: "No department assigned" }, ...departments]} /><NativeSelect aria-label="Sort user accounts" value={sort} onChange={(event) => setSort(event.target.value)} options={[{ value: "NEWEST", label: "Newest accounts" }, { value: "OLDEST", label: "Oldest accounts" }, { value: "NAME", label: "Name A–Z" }]} /></div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={unlinked} onChange={(event) => setUnlinked(event.target.checked)} />Faculty links needing review</label><div className="flex items-center gap-3"><span className="text-muted-foreground">{filtered.length} matching accounts</span><button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><ArrowCounterClockwise className="size-3.5" />Reset filters</button></div></div>
      </CardContent></Card>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Role & department</TableHead>
              <TableHead>Login access status</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paging.visible.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar name={u.name} image={u.image} small className="size-8" />
                    <div className="min-w-0"><p className="flex flex-wrap items-center gap-2">{u.name}{u.id === viewerId && <Badge variant="outline" className="text-[10px]">You</Badge>}</p><p className="mt-1 text-xs font-normal text-muted-foreground">{u.email}</p>{u.facultyLabel && <p className="mt-1 text-xs font-normal text-muted-foreground">{u.facultyLabel} · Teaching: {u.facultyStatus?.toLowerCase() ?? "unknown"}</p>}{u.facultyArchived && <p className="mt-1 text-xs font-medium text-amber-700">Linked faculty record is archived. Review the identity link.</p>}{u.facultyContactEmail && u.facultyContactEmail !== u.email && <p className="mt-1 text-xs font-normal text-muted-foreground">Faculty contact: {facultyContactPending(u.facultyContactEmail) ? "details pending" : u.facultyContactEmail}</p>}</div>
                  </div>
                </TableCell>
                <TableCell className="min-w-44"><Badge variant="secondary">{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</Badge>{u.departmentNames.length > 0 && <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">{u.departmentNames.join(" · ")}</p>}{["FACULTY", "HEAD_OF_DEPARTMENT"].includes(u.role) && !u.facultyId && <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">No faculty link</p>}</TableCell>
                <TableCell><Badge variant="outline" className={cn(u.status === "ACTIVE" ? "border-emerald-600/25 bg-emerald-600/5 text-emerald-800 dark:text-emerald-300" : u.status === "PENDING" ? "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200" : "border-destructive/25 text-destructive")}>{u.status[0] + u.status.slice(1).toLowerCase()}</Badge><p className="mt-1.5 text-[11px] text-muted-foreground">{u.emailVerified ? "Email verified" : "Email not verified"}</p></TableCell>
                <TableCell>
                  <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
                    {u.status === "PENDING" && <Button type="button" size="sm" disabled={pending} onClick={() => handleApprove(u.id)}><CheckCircle className="size-3.5" />Approve</Button>}
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => edit(u)}>Edit</Button>
                    <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" disabled={pending} aria-label={`More actions for ${u.name}`} />}><DotsThree className="size-5" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-52">
                      {u.role === "HEAD_OF_DEPARTMENT" && <DropdownMenuItem onClick={() => setProgramRow(u)}><UserCircle />Manage program access</DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => { setError(null); setResetRow(u); }}><Key />Reset password</DropdownMenuItem>
                      {u.image && <DropdownMenuItem onClick={() => handleRemovePhoto(u.id)}><UserCircle />Remove profile photo</DropdownMenuItem>}
                      <DropdownMenuItem render={<Link href={`/admin/audit-logs?entity=User&record=${encodeURIComponent(u.id)}`} />}><Clock />Account audit history</DropdownMenuItem>
                      <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" disabled={u.id === viewerId} onClick={() => setArchiveRow(u)}><Archive />Archive account</DropdownMenuItem>
                    </DropdownMenuContent></DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={4} className="py-12 text-center"><p className="text-sm font-medium">{others.length ? "No accounts match these filters" : "No accounts yet"}</p><p className="mt-1 text-xs text-muted-foreground">{others.length ? "Try another status, role, department, or search." : "Create an account to start managing access."}</p></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Pagination {...paging} />
      </details>
      {archiveRow && <ArchiveButton kind="USER" id={archiveRow.id} name={archiveRow.name} open hideTrigger onOpenChange={(open) => !open && setArchiveRow(null)} />}

      {editRow && (
        <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit account · {editRow.name}</DialogTitle><DialogDescription>Update account details and access.</DialogDescription></DialogHeader>
            <form action={handleUpdate}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="edit-name">Name</FieldLabel>
                  <input name="name" id="edit-name" defaultValue={editRow.name} readOnly={!!editRow.facultyId} required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                  {editRow.facultyId && <p className="text-xs text-muted-foreground">This name follows the linked faculty record. Update faculty identity details through the Registrar’s <Link href="/faculty" className="text-primary underline">Faculty</Link> page.</p>}
                </Field>
                {editRow.role !== "STUDENT" ? <Field>
                  <FieldLabel htmlFor="edit-role">Role</FieldLabel>
                  <select name="role" id="edit-role" defaultValue={editRow.role} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field> : <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Student accounts retain their student role and section membership.</p>}
                {editRow.role === "FACULTY" && editRow.facultyId ? <p className="text-sm">Faculty department: {editRow.facultyDepartmentName ?? "Unassigned"}<input type="hidden" name="departmentId" value={editRow.facultyDepartmentId ?? ""} /></p> : editRow.role !== "STUDENT" && <DepartmentField id="edit-department" options={allDepartments} value={editRow.assignedDepartmentId} />}
                <Field>
                  <FieldLabel htmlFor="edit-status">Login access status</FieldLabel>
                  <select name="status" id="edit-status" defaultValue={editRow.status} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="PENDING">Pending approval</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </Field>
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Save Changes
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {programRow && (
        <ProgramAssignments
          userId={programRow.id}
          name={programRow.name}
          // Read the live row so the list refreshes after each change.
          options={users.find((u) => u.id === programRow.id)?.programOptions ?? []}
          rows={users.find((u) => u.id === programRow.id)?.assignments ?? []}
          onClose={() => setProgramRow(null)}
        />
      )}

      {issued && <Dialog open onOpenChange={(o) => !o && setIssued(null)}><DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Login details</DialogTitle><DialogDescription>Shown once.</DialogDescription></DialogHeader>
        <div className="space-y-1 rounded-lg bg-muted/60 p-3 font-mono text-sm"><p>{issued.email}</p><p className="font-semibold">{issued.password}</p></div>
        <Button onClick={() => { navigator.clipboard.writeText(`Email: ${issued.email}
Password: ${issued.password}`).then(() => toast.success("Copied.")); }}><Copy className="size-4" />Copy login</Button>
      </DialogContent></Dialog>}

      {resetRow && (
        <Dialog open={!!resetRow} onOpenChange={(o) => !o && setResetRow(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Reset password · {resetRow.name}</DialogTitle><DialogDescription>Signs the user out everywhere; password change required on next login.</DialogDescription></DialogHeader>
            <Button onClick={handleReset} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Generate new password</Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
