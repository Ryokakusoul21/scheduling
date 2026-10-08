"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch as Loader2 } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { updateInstitutionAction, setRequireApprovalAction } from "./actions";

export function SettingsManager({
  institution,
  requireApproval,
}: {
  institution: { name: string; shortName: string; location: string };
  requireApproval: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const res = await updateInstitutionAction(formData);
      if (res.ok) toast.success("Institution settings saved.");
    });
  }



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
        <CardHeader><CardTitle>Registration</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">Require admin approval</p>
              <p className="text-xs text-muted-foreground">
                Self-registered accounts stay pending until an administrator approves them in User Management.
              </p>
            </div>
            <Switch
              checked={requireApproval}
              disabled={pending}
              onCheckedChange={(v) =>
                startTransition(async () => {
                  await setRequireApprovalAction(!!v);
                  toast.success(v ? "New registrations now require approval." : "New registrations are activated automatically.");
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
