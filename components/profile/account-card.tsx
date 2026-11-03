"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, PencilSimple } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { updateNameAction } from "@/app/(dashboard)/profile/actions";

const LOCKED = "Contact an administrator to change this.";

function Label({ children, locked }: { children: string; locked?: boolean }) {
  return (
    <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {children}
      {locked && (
        <Tooltip>
          <TooltipTrigger render={<button type="button" aria-label={`${children} is locked. ${LOCKED}`} className="rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}>
            <Lock className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{LOCKED}</TooltipContent>
        </Tooltip>
      )}
    </dt>
  );
}

/** Account details; the name edits in place, email and role are read-only, and role-specific rows come from the page. */
export function AccountCard({
  name,
  email,
  role,
  details,
}: {
  name: string;
  email: string;
  role: string;
  details: { label: string; value: string }[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // The hero's Edit profile button asks for the name field.
  useEffect(() => {
    const open = () => setEditing(true);
    window.addEventListener("profile:edit-name", open);
    return () => window.removeEventListener("profile:edit-name", open);
  }, []);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  function save() {
    start(async () => {
      const res = await updateNameAction(value);
      if (!res.ok) return setError(res.error);
      toast.success("Name updated");
      setEditing(false);
      setError(null);
      router.refresh();
    });
  }

  function cancel() {
    setEditing(false);
    setValue(name);
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Account</CardTitle>
        <CardDescription className="text-sm">Your name is editable. Email and role are managed by an administrator.</CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Name</Label>
              {editing ? (
                <form
                  onSubmit={(e) => (e.preventDefault(), save())}
                  onKeyDown={(e) => e.key === "Escape" && cancel()}
                  className="flex max-w-md flex-wrap items-start gap-2"
                >
                  <div className="min-w-48 flex-1 space-y-1">
                    <Input
                      ref={input}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      aria-label="Name"
                      aria-invalid={!!error}
                      aria-describedby={error ? "name-error" : undefined}
                      maxLength={100}
                      className="h-10 md:text-base"
                    />
                    {error && <p id="name-error" role="alert" className="text-sm text-destructive">{error}</p>}
                  </div>
                  <Button type="submit" disabled={pending || value.trim() === name || value.trim().length < 2} className="h-10">Save</Button>
                  <Button type="button" variant="outline" onClick={cancel} className="h-10">Cancel</Button>
                </form>
              ) : (
                <dd className="flex items-center gap-2 text-base font-medium">
                  {name}
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Edit name" onClick={() => setEditing(true)}>
                    <PencilSimple className="size-4" />
                  </Button>
                </dd>
              )}
            </div>
            <div className="space-y-1">
              <Label locked>Email</Label>
              <dd className="text-base font-medium break-all">{email}</dd>
            </div>
            <div className="space-y-1">
              <Label locked>Role</Label>
              <dd className="text-base font-medium">{role}</dd>
            </div>
            {details.map((d) => (
              <div key={d.label} className="space-y-1">
                <Label locked>{d.label}</Label>
                <dd className="text-base font-medium">{d.value}</dd>
              </div>
            ))}
          </dl>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
