"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";

export interface CrudField {
  name: string;
  label: string;
  type: "text" | "number" | "email" | "select" | "date" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  step?: string;
}

export interface CrudColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export function EntityCrud<T extends { id: string }>({
  title,
  columns,
  rows,
  fields,
  onCreate,
  onUpdate,
  onDelete,
  getFieldValue,
  deleteLabel,
  canEdit = true,
}: {
  title: string;
  columns: CrudColumn<T>[];
  rows: T[];
  fields: CrudField[];
  onCreate: (formData: FormData) => Promise<ActionResult>;
  onUpdate?: (id: string, formData: FormData) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  getFieldValue?: (row: T, fieldName: string) => string;
  deleteLabel?: (row: T) => string;
  canEdit?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  function defaultGetFieldValue(row: T, name: string) {
    return String((row as unknown as Record<string, unknown>)[name] ?? "");
  }

  function renderFields(row?: T) {
    return fields.map((f) => {
      const value = row ? (getFieldValue ?? defaultGetFieldValue)(row, f.name) : f.defaultValue ?? "";
      if (f.type === "select") {
        return (
          <Field key={f.name}>
            <FieldLabel htmlFor={f.name}>{f.label}</FieldLabel>
            <select
              name={f.name}
              id={f.name}
              required={f.required}
              defaultValue={value}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        );
      }
      if (f.type === "checkbox") {
        return (
          <label key={f.name} className="flex items-center gap-2 text-sm font-medium">
            <Checkbox name={f.name} defaultChecked={value === "true"} />
            {f.label}
          </label>
        );
      }
      return (
        <Field key={f.name}>
          <FieldLabel htmlFor={f.name}>{f.label}</FieldLabel>
          <input
            type={f.type}
            step={f.step}
            name={f.name}
            id={f.name}
            required={f.required}
            defaultValue={value}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </Field>
      );
    });
  }

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await onCreate(formData);
      if (res.ok) {
        toast.success(`${title} created.`);
        setCreateOpen(false);
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  function handleUpdate(formData: FormData) {
    if (!editRow || !onUpdate) return;
    setError(null);
    startTransition(async () => {
      const res = await onUpdate(editRow.id, formData);
      if (res.ok) {
        toast.success(`${title} updated.`);
        setEditRow(null);
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await onDelete(id);
      if (res.ok) toast.success(`${title} deleted.`);
      else toast.error(res.error ?? "Could not delete.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="size-4" /> New {title}
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create {title}</DialogTitle>
            </DialogHeader>
            <form action={handleCreate}>
              <FieldGroup>
                {renderFields()}
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Create
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
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                  No {title.toLowerCase()} records yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((c) => (
                  <TableCell key={c.key}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </TableCell>
                ))}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && onUpdate && (
                        <DropdownMenuItem onClick={() => setEditRow(row)}>
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger
                          nativeButton={false}
                          render={<DropdownMenuItem variant="destructive" onClick={(e) => e.preventDefault()} />}
                        >
                          <Trash2 className="size-4" /> Delete
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this {title.toLowerCase()}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {deleteLabel ? deleteLabel(row) : "This cannot be undone."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={() => handleDelete(row.id)}
                            >
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

      {editRow && onUpdate && (
        <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {title}</DialogTitle>
            </DialogHeader>
            <form action={handleUpdate}>
              <FieldGroup>
                {renderFields(editRow)}
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Save Changes
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
