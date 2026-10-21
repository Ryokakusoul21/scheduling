"use client";

import { ROLE_LABELS } from "@/lib/permissions/roles";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, CircleNotch as Loader2 } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ux/action-button";
import { ArchiveButton } from "@/components/ux/archive-button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createUserAction, updateUserAction, resetPasswordAction, approveUserAction } from "./actions";

interface Row {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  facultyId: string | null;
  createdAt: string;
}

/** Links an account to a faculty record so Faculty and Head of Department users see their own classes. */
function FacultyLinkField({ id, options, value }: { id: string; options: { value: string; label: string }[]; value?: string | null }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Linked faculty record</FieldLabel>
      <select name="facultyId" id={id} defaultValue={value ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">None (Administrator accounts)</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

// Student accounts come only from the student registration page.
const ROLES = Object.entries(ROLE_LABELS).filter(([value]) => value !== "STUDENT").map(([value, label]) => ({ value, label }));

export function UsersManager({ users, faculty }: { users: Row[]; faculty: { value: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [resetRow, setResetRow] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  function handleReset(formData: FormData) {
    if (!resetRow) return;
    setError(null);
    const password = String(formData.get("password") ?? "");
    startTransition(async () => {
      const res = await resetPasswordAction(resetRow.id, password);
      if (res.ok) {
        toast.success("Password reset.");
        setResetRow(null);
      } else setError(res.error ?? "Something went wrong.");
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="size-4" /> New User
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
            <form action={handleCreate}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <input name="name" id="name" required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <input type="email" name="email" id="email" required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="role">Role</FieldLabel>
                  <select name="role" id="role" required className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <FacultyLinkField id="faculty" options={faculty} />
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <input type="password" name="password" id="password" required minLength={8} placeholder="8+ chars, upper, lower, number, symbol" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </Field>
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Create User
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Badge variant="secondary">{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</Badge></TableCell>
                <TableCell><Badge variant={u.status === "ACTIVE" ? "default" : u.status === "PENDING" ? "secondary" : "destructive"}>{u.status}</Badge></TableCell>
                <TableCell>{u.createdAt}</TableCell>
                <TableCell>
                  <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
                    {u.status === "PENDING" && (
                      <ActionButton kind="approve" onClick={() => handleApprove(u.id)}>
                        Approve
                      </ActionButton>
                    )}
                    <ActionButton kind="edit" onClick={() => setEditRow(u)}>
                      Edit
                    </ActionButton>
                    <ActionButton kind="reset" onClick={() => setResetRow(u)}>
                      Reset Password
                    </ActionButton>
                    <ArchiveButton kind="USER" id={u.id} name={u.name} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editRow && (
        <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
            <form action={handleUpdate}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="edit-name">Name</FieldLabel>
                  <input name="name" id="edit-name" defaultValue={editRow.name} required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-role">Role</FieldLabel>
                  <select name="role" id="edit-role" defaultValue={editRow.role} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <FacultyLinkField id="edit-faculty" options={faculty} value={editRow.facultyId} />
                <Field>
                  <FieldLabel htmlFor="edit-status">Status</FieldLabel>
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

      {resetRow && (
        <Dialog open={!!resetRow} onOpenChange={(o) => !o && setResetRow(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Reset Password for {resetRow.name}</DialogTitle></DialogHeader>
            <form action={handleReset}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="password">New Password</FieldLabel>
                  <input type="password" name="password" id="password" required minLength={8} placeholder="8+ chars, upper, lower, number, symbol" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </Field>
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Reset Password
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
