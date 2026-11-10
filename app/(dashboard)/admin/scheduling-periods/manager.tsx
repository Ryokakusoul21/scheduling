"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarDots, LockKey, LockKeyOpen } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ux/states";
import { saveSchedulingPeriodAction, setSchedulingPeriodStatusAction } from "./actions";

type PeriodKind = "CLASS_TIMETABLE" | "EXAMINATION";
type Period = {
  id: string;
  semesterId: string;
  semester: string;
  kind: PeriodKind;
  name: string;
  startsAt: string;
  endsAt: string;
  status: "OPEN" | "CLOSED";
};

function localInput(date: string) {
  return new Date(date).toLocaleString("sv-SE", { timeZone: "Asia/Manila" }).replace(" ", "T");
}

function displayDate(date: string) {
  return new Date(date).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
}

export function SchedulingPeriodsManager({ semesters, periods }: { semesters: { id: string; label: string }[]; periods: Period[] }) {
  const [pending, startTransition] = useTransition();
  const inputClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await saveSchedulingPeriodAction(formData);
      if (result.ok) toast.success("Scheduling period saved.");
      else toast.error(result.error);
    });
  }

  function setStatus(period: Period) {
    const status = period.status === "OPEN" ? "CLOSED" : "OPEN";
    startTransition(async () => {
      const result = await setSchedulingPeriodStatusAction(period.id, status);
      if (result.ok) toast.success(`Scheduling period ${status.toLowerCase()}.`);
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Scheduling Periods"
        description="Open or close timetable and examination submission windows. Departments can submit only while the matching period is open and within its dates."
      />

      <Card>
        <CardHeader><CardTitle>Set a submission window</CardTitle></CardHeader>
        <CardContent>
          {semesters.length ? (
            <form action={save}>
              <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Field>
                  <FieldLabel htmlFor="semesterId">Term</FieldLabel>
                  <select className={inputClass} id="semesterId" name="semesterId" required defaultValue="">
                    <option value="" disabled>Select a term</option>
                    {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.label}</option>)}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="kind">Workflow</FieldLabel>
                  <select className={inputClass} id="kind" name="kind" required defaultValue="CLASS_TIMETABLE">
                    <option value="CLASS_TIMETABLE">Class timetable submission</option>
                    <option value="EXAMINATION">Examination submission</option>
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="name">Period name</FieldLabel>
                  <Input id="name" name="name" maxLength={100} placeholder="Class timetable submission" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="startsAt">Opens</FieldLabel>
                  <Input className="h-9" id="startsAt" name="startsAt" type="datetime-local" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="endsAt">Closes</FieldLabel>
                  <Input className="h-9" id="endsAt" name="endsAt" type="datetime-local" required />
                </Field>
                <div className="sm:col-span-2 lg:col-span-5">
                  <Button type="submit" disabled={pending || !semesters.length}>Save period</Button>
                  <p className="mt-2 text-xs text-muted-foreground">Dates use Philippine time. Saving a period does not open it; use Open after saving.</p>
                </div>
              </FieldGroup>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Create an academic term before setting a scheduling period.</p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3" aria-label="Configured scheduling periods">
        <h2 className="text-lg font-semibold">Configured periods</h2>
        {periods.length ? periods.map((period) => (
          <Card key={period.id}>
            <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{period.name}</h3>
                  <Badge variant={period.status === "OPEN" ? "default" : "secondary"}>{period.status === "OPEN" ? "Open" : "Closed"}</Badge>
                  <Badge variant="outline">{period.kind === "CLASS_TIMETABLE" ? "Class timetable" : "Examination"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{period.semester} · {displayDate(period.startsAt)} to {displayDate(period.endsAt)}</p>
                <form action={save} className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-5">
                  <input type="hidden" name="semesterId" value={period.semesterId} />
                  <input type="hidden" name="kind" value={period.kind} />
                  <Field><FieldLabel htmlFor={`name-${period.id}`}>Name</FieldLabel><Input id={`name-${period.id}`} name="name" defaultValue={period.name} maxLength={100} required /></Field>
                  <Field><FieldLabel htmlFor={`starts-${period.id}`}>Opens</FieldLabel><Input id={`starts-${period.id}`} name="startsAt" type="datetime-local" defaultValue={localInput(period.startsAt)} required /></Field>
                  <Field><FieldLabel htmlFor={`ends-${period.id}`}>Closes</FieldLabel><Input id={`ends-${period.id}`} name="endsAt" type="datetime-local" defaultValue={localInput(period.endsAt)} required /></Field>
                  <div className="flex items-end"><Button type="submit" variant="outline" disabled={pending}>Save dates</Button></div>
                </form>
              </div>
              <Button variant={period.status === "OPEN" ? "outline" : "default"} disabled={pending} onClick={() => setStatus(period)}>
                {period.status === "OPEN" ? <LockKey className="size-4" /> : <LockKeyOpen className="size-4" />}
                {period.status === "OPEN" ? "Close period" : "Open period"}
              </Button>
            </CardContent>
          </Card>
        )) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <CalendarDots className="mx-auto mb-2 size-6" />
            No scheduling periods have been configured.
          </div>
        )}
      </section>
    </div>
  );
}
