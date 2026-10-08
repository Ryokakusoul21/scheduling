"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch } from "@phosphor-icons/react/ssr";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "./native-select";
import { cn } from "@/lib/utils";

export type ActionResult = { ok: boolean; error?: string };

export interface FormField {
  name: string;
  label: string;
  type: "text" | "number" | "email" | "date" | "select" | "textarea" | "checkboxes" | "checkbox" | "hidden";
  options?: { value: string; label: string }[];
  required?: boolean;
  step?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  help?: string;
  /** Span both columns in the two-column layout. */
  wide?: boolean;
}

/**
 * Generic add/edit dialog driven by a field list. Submits a FormData to a
 * server action; multi-value fields (checkboxes) appear as repeated keys.
 * Enter submits, Esc closes, and focus starts on the first field.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  values = {},
  submitLabel = "Save",
  onSubmit,
  successMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FormField[];
  /** Initial values keyed by field name (any object, e.g. the row being edited). */
  values?: object;
  submitLabel?: string;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  successMessage?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const twoColumns = fields.filter((f) => f.type !== "hidden").length > 4;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(formData);
      if (res.ok) {
        if (successMessage) toast.success(successMessage);
        onOpenChange(false);
      } else {
        setError(res.error ?? "Could not save. Please check the form.");
      }
    });
  }

  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", twoColumns ? "sm:max-w-2xl" : "sm:max-w-md")}>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <FieldGroup className={cn("mt-4", twoColumns && "grid gap-4 sm:grid-cols-2")}>
            {fields.map((f, i) => {
              const id = `fd-${f.name}`;
              const value = (values as Record<string, unknown>)[f.name];
              if (f.type === "hidden") return <input key={f.name} type="hidden" name={f.name} value={str(value)} />;
              if (f.type === "checkbox") {
                return (
                  <label key={f.name} className={cn("flex items-center gap-2 text-sm", f.wide && "sm:col-span-2")}>
                    <input type="checkbox" name={f.name} value="true" defaultChecked={value === true || value === "true"} className="size-4 accent-primary" />
                    {f.label}
                  </label>
                );
              }
              if (f.type === "checkboxes") {
                const selected = Array.isArray(value) ? (value as string[]) : [];
                return (
                  <fieldset key={f.name} className={cn("space-y-2", f.wide && "sm:col-span-2")}>
                    <legend className="mb-2 text-sm font-medium">{f.label}</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {f.options?.map((o) => (
                        <label key={o.value} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name={f.name} value={o.value} defaultChecked={selected.includes(o.value)} className="size-4 accent-primary" />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    {f.help && <FieldDescription>{f.help}</FieldDescription>}
                  </fieldset>
                );
              }
              return (
                <Field key={f.name} className={cn(f.wide && "sm:col-span-2")}>
                  <FieldLabel htmlFor={id}>
                    {f.label}
                    {f.required && <span className="text-destructive" aria-hidden> *</span>}
                  </FieldLabel>
                  {f.type === "select" ? (
                    <NativeSelect id={id} name={f.name} defaultValue={str(value)} required={f.required} options={f.options} />
                  ) : f.type === "textarea" ? (
                    <Textarea id={id} name={f.name} defaultValue={str(value)} required={f.required} placeholder={f.placeholder} rows={3} />
                  ) : (
                    <Input
                      id={id}
                      name={f.name}
                      type={f.type}
                      step={f.step}
                      min={f.min}
                      max={f.max}
                      defaultValue={str(value)}
                      required={f.required}
                      placeholder={f.placeholder}
                      autoFocus={i === 0}
                    />
                  )}
                  {f.help && <FieldDescription>{f.help}</FieldDescription>}
                </Field>
              );
            })}
          </FieldGroup>
          {error && (
            <FieldError className="mt-3" role="alert">
              {error}
            </FieldError>
          )}
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <CircleNotch className="size-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation for destructive actions; shows the server's error if the delete is refused. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  successMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<ActionResult>;
  successMessage?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await onConfirm();
                if (res.ok) {
                  if (successMessage) toast.success(successMessage);
                  onOpenChange(false);
                } else {
                  toast.error(res.error ?? "Could not delete.");
                }
              });
            }}
          >
            {pending && <CircleNotch className="size-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Small state helper for "which item is the dialog editing?" */
export function useDialogState<T>() {
  const [state, setState] = useState<{ mode: "create" } | { mode: "edit"; item: T } | null>(null);
  return {
    state,
    openCreate: () => setState({ mode: "create" }),
    openEdit: (item: T) => setState({ mode: "edit", item }),
    close: () => setState(null),
  };
}
