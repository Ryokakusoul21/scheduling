"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch as Loader2 } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { WorkloadSettings } from "@/lib/settings";
import type { BookingSettings } from "@/lib/bookings/plan";
import { updateInstitutionAction, updateWorkloadAction, setRequireApprovalAction, updateBookingSettingsAction } from "./actions";

export function SettingsManager({
  institution,
  requireApproval,
  workload,
  booking,
}: {
  institution: { name: string; location: string };
  requireApproval: boolean;
  workload: WorkloadSettings;
  booking: BookingSettings;
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
      if (res.ok) toast.success("Teaching load settings saved. Loads are being rechecked.");
      else toast.error(res.error ?? "Could not save the load limits.");
    });
  }

  const inputClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  function handleBooking(formData: FormData) {
    startTransition(async () => {
      const res = await updateBookingSettingsAction(formData);
      if (res.ok) toast.success("Room booking rules saved.");
      else toast.error(res.error ?? "Check the values.");
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
                Every change that affects a load rechecks all teaching loads. Anyone below the minimum is underloaded and anyone above the maximum (or the unit cap) is overloaded. Every fix is a proposal that the Head of Department approves.
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
                  <FieldLabel htmlFor="minimum">Full-time minimum</FieldLabel>
                  <input type="number" step="0.5" min={0} name="minimum" id="minimum" defaultValue={workload.minimum} required className={inputClass} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="maximum">Full-time maximum</FieldLabel>
                  <input type="number" step="0.5" min={1} name="maximum" id="maximum" defaultValue={workload.maximum} required className={inputClass} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="partTimeMinimum">Part-time minimum</FieldLabel>
                  <input type="number" step="0.5" min={0} name="partTimeMinimum" id="partTimeMinimum" defaultValue={workload.partTimeMinimum} required className={inputClass} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="partTimeMaximum">Part-time maximum</FieldLabel>
                  <input type="number" step="0.5" min={1} name="partTimeMaximum" id="partTimeMaximum" defaultValue={workload.partTimeMaximum} required className={inputClass} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="maxUnits">Maximum units</FieldLabel>
                  <input type="number" step="0.5" min={1} name="maxUnits" id="maxUnits" defaultValue={workload.maxUnits} required className={inputClass} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tolerance">Balance tolerance</FieldLabel>
                  <input type="number" step="0.5" min={0} name="tolerance" id="tolerance" defaultValue={workload.tolerance} required className={inputClass} aria-describedby="tolerance-help" />
                </Field>
              </div>
              <p id="tolerance-help" className="text-xs text-muted-foreground">Balance tolerance is how far a load may sit from its department&apos;s average before the check proposes evening it out. Use 0 to turn it off.</p>
              <Field>
                <FieldLabel htmlFor="crossDepartment">Reassignments across departments</FieldLabel>
                <select name="crossDepartment" id="crossDepartment" defaultValue={workload.crossDepartment} className={inputClass}>
                  <option value="BOTH_HEADS">Allowed with approval from both Heads of Department</option>
                  <option value="DISALLOWED">Not allowed: keep reassignments inside a department</option>
                </select>
              </Field>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Save Load Settings
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Room Booking Rules</CardTitle></CardHeader>
        <CardContent>
          <form action={handleBooking}>
            <FieldGroup>
              <p className="text-xs text-muted-foreground">Buffer time is kept free between two bookings of the same room. Urgent overrides beyond the monthly caps are refused (the Administrator is not capped).</p>
              <div className="grid grid-cols-2 gap-3">
                <Field><FieldLabel htmlFor="openTime">Rooms open</FieldLabel><input type="time" step={1800} name="openTime" id="openTime" defaultValue={hhmm(booking.openMin)} required className={inputClass} /></Field>
                <Field><FieldLabel htmlFor="closeTime">Rooms close</FieldLabel><input type="time" step={1800} name="closeTime" id="closeTime" defaultValue={hhmm(booking.closeMin)} required className={inputClass} /></Field>
                <Field><FieldLabel htmlFor="bufferMinutes">Buffer between bookings (minutes)</FieldLabel><input type="number" min={0} max={60} name="bufferMinutes" id="bufferMinutes" defaultValue={booking.bufferMinutes} required className={inputClass} /></Field>
                <Field><FieldLabel htmlFor="urgentCapPerUser">Urgent overrides per person each month</FieldLabel><input type="number" min={0} name="urgentCapPerUser" id="urgentCapPerUser" defaultValue={booking.urgentCapPerUser} required className={inputClass} /></Field>
                <Field><FieldLabel htmlFor="urgentCapPerDepartment">Urgent overrides per department each month</FieldLabel><input type="number" min={0} name="urgentCapPerDepartment" id="urgentCapPerDepartment" defaultValue={booking.urgentCapPerDepartment} required className={inputClass} /></Field>
              </div>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Save Booking Rules</Button>
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
