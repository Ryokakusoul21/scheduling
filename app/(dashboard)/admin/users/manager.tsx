"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Pencil, KeyRound, Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createUserAction, updateUserAction, resetPasswordAction, deleteUserAction } from "./actions";

interface Row {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

const ROLES = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMINISTRATOR", label: "Administrator" },
  { value: "REGISTRAR", label: "Registrar" },
  { value: "SCHEDULER", label: "Scheduler" },
  { value: "FACULTY", label: "Faculty" },
  { value: "STUDENT", label: "Student" },
];

export function UsersManager({ users }: { users: Row[] }) {
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

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteUserAction(id);
      if (res.ok) toast.success("User deleted.");
      else toast.error(res.error ?? "Could not delete.");
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
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <input type="password" name="password" id="password" required minLength={6} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
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
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Badge variant="secondary">{u.role.replace("_", " ")}</Badge></TableCell>
                <TableCell><Badge variant={u.status === "ACTIVE" ? "default" : "destructive"}>{u.status}</Badge></TableCell>
                <TableCell>{u.createdAt}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditRow(u)}>
                        <Pencil className="size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setResetRow(u)}>
                        <KeyRound className="size-4" /> Reset Password
                      </DropdownMenuItem>
                      <AlertDialog>
                        <AlertDialogTrigger render={<DropdownMenuItem variant="destructive" onClick={(e) => e.preventDefault()} />}>
                          <Trash2 className="size-4" /> Delete
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
                            <AlertDialogDescription>This removes the login for {u.email}.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => handleDelete(u.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                <Field>
                  <FieldLabel htmlFor="edit-status">Status</FieldLabel>
                  <select name="status" id="edit-status" defaultValue={editRow.status} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
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
                  <input type="password" name="password" id="password" required minLength={6} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
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
