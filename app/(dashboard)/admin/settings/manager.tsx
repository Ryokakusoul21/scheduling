"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { updateInstitutionAction, toggleConstraintAction } from "./actions";

interface Constraint {
  id: string;
  name: string;
  type: string;
  weight: number;
  isActive: boolean;
}

export function SettingsManager({
  institution,
  constraints,
}: {
  institution: { name: string; shortName: string; location: string };
  constraints: Constraint[];
}) {
  const [pending, startTransition] = useTransition();

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const res = await updateInstitutionAction(formData);
      if (res.ok) toast.success("Institution settings saved.");
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      await toggleConstraintAction(id, isActive);
    });
  }

  const hard = constraints.filter((c) => c.type === "HARD");
  const soft = constraints.filter((c) => c.type === "SOFT");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Institution</CardTitle></CardHeader>
        <CardContent>
          <form action={handleSave}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Full Name</FieldLabel>
                <input name="name" id="name" defaultValue={institution.name} required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
              </Field>
              <Field>
                <FieldLabel htmlFor="shortName">Short Name</FieldLabel>
                <input name="shortName" id="shortName" defaultValue={institution.shortName} required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
              </Field>
              <Field>
                <FieldLabel htmlFor="location">Location</FieldLabel>
                <input name="location" id="location" defaultValue={institution.location} required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
              </Field>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Save Changes
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Scheduling Constraints</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hard Constraints (always enforced)</p>
            <div className="space-y-1.5">
              {hard.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>{c.name.replace(/_/g, " ")}</span>
                  <Badge variant="destructive">Required</Badge>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Soft Constraints (optimized)</p>
            <div className="space-y-1.5">
              {soft.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>{c.name.replace(/_/g, " ")} <span className="text-xs text-muted-foreground">(weight {c.weight})</span></span>
                  <Switch checked={c.isActive} onCheckedChange={(v) => handleToggle(c.id, !!v)} disabled={pending} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
