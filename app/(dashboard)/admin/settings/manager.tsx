"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch as Loader2 } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { updateInstitutionAction, updateWorkloadAction, setRequireApprovalAction } from "./actions";

export function SettingsManager({
  institution,
  requireApproval,
  workload,
}: {
  institution: { name: string; location: string };
  requireApproval: boolean;
  workload: { measure: "HOURS" | "UNITS"; minimum: number; maximum: number };
}) {
  const [pending, startTransition] = useTransition();

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const res = await updateInstitutionAction(formData);
      if (res.ok) toast.success("Institution settings saved.");
    });
  }

  function handleWorkload(formData: FormData) {
    startTransition(async () => {
      const res = await updateWorkloadAction(formData);
      if (res.ok) toast.success("Teaching load limits saved.");
      else toast.error(res.error ?? "Could not save the load limits.");
    });
  }

  const inputClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

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
        <CardHeader><CardTitle>Teaching Load Limits</CardTitle></CardHeader>
        <CardContent>
          <form action={handleWorkload}>
            <FieldGroup>
              <p className="text-xs text-muted-foreground">
                Faculty Workload Optimization flags anyone below the minimum as underloaded and above the maximum as overloaded.
              </p>
              <Field>
                <FieldLabel htmlFor="measure">Measure load in</FieldLabel>
                <select name="measure" id="measure" defaultValue={workload.measure} className={inputClass}>
                  <option value="HOURS">Weekly contact hours</option>
                  <option value="UNITS">Subject units</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="minimum">Minimum load</FieldLabel>
                  <input type="number" step="0.5" min={0} name="minimum" id="minimum" defaultValue={workload.minimum} required className={inputClass} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="maximum">Maximum load</FieldLabel>
                  <input type="number" step="0.5" min={1} name="maximum" id="maximum" defaultValue={workload.maximum} required className={inputClass} />
                </Field>
              </div>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Save Load Limits
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
              <p className="font-medium">Require Administrator approval</p>
              <p className="text-xs text-muted-foreground">
                Self-registered accounts stay pending until an Administrator approves them in User Management.
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
