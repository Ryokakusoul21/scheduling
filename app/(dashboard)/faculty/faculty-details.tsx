"use client";

import Link from "next/link";
import { CalendarBlank, LockSimple } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LoadBar, LoadStatusLabel } from "@/components/workload/load-bar";
import { levelLabel } from "@/lib/academics/levels";
import type { FacultyRow } from "./faculty-browser";

export function FacultyDetails({ faculty, onClose }: { faculty: FacultyRow | null; onClose: () => void }) {
  const status = faculty?.status === "ACTIVE" ? "Active" : faculty?.status === "ON_LEAVE" ? "On leave" : "Inactive";

  return (
    <Dialog open={!!faculty} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        {faculty && <>
          <DialogHeader className="shrink-0 border-b bg-primary/5 px-6 py-6 pr-12">
            <div className="flex items-start gap-4">
              <UserAvatar name={faculty.fullName} image={faculty.image} className="size-16 shrink-0 text-xl ring-4 ring-background" />
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Faculty profile</p>
                <DialogTitle className="text-2xl leading-tight font-semibold wrap-anywhere">{faculty.fullName}</DialogTitle>
                {faculty.position && <p className="text-sm text-muted-foreground">{faculty.position}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">{faculty.employeeId}</span>
                  <Badge variant="outline" className={faculty.status === "ACTIVE" ? "gap-1.5 border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "gap-1.5"}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />{status}
                  </Badge>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-5">
            <dl className="space-y-4">
              {faculty.department && <div>
                <dt className="text-xs text-muted-foreground">Department</dt>
                <dd className="mt-1 text-sm leading-relaxed font-medium wrap-anywhere">{faculty.department}</dd>
              </div>}
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="mt-1 text-sm wrap-anywhere">{faculty.email}</dd>
              </div>
            </dl>

            <section aria-label="Teaching overview" className="space-y-4 border-t pt-5">
              <h3 className="text-sm font-semibold">Teaching overview</h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                {faculty.specialization && <div>
                  <dt className="text-xs text-muted-foreground">Specialization</dt>
                  <dd className="mt-1.5 text-sm wrap-anywhere">{faculty.specialization}</dd>
                </div>}
                {faculty.teachingLevels.length > 0 && <div>
                  <dt className="text-xs text-muted-foreground">Teaches at</dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">
                    {faculty.teachingLevels.map((level) => <Badge key={level} variant="secondary">{levelLabel(level)}</Badge>)}
                  </dd>
                </div>}
              </dl>
              {faculty.load && <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Teaching load this term</p>
                  <LoadStatusLabel status={faculty.load.status} r={faculty.load} />
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="mr-1 text-2xl font-semibold tabular-nums text-foreground">{faculty.load.load}</span>
                  of {faculty.load.maximum} {faculty.loadUnit} assigned
                </p>
                <LoadBar r={faculty.load} />
              </div>}
            </section>

            <section aria-label="Employment" className="space-y-4 border-t pt-5">
              <h3 className="text-sm font-semibold">Employment</h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Employment type</dt>
                  <dd className="mt-1.5 text-sm">{faculty.employmentType === "FULL_TIME" ? "Full-time" : "Part-time"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Maximum weekly teaching hours</dt>
                  <dd className="mt-1.5 text-sm">{faculty.maxHours} hours</dd>
                </div>
                {faculty.availableDays.length > 0 && <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Available days</dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">{faculty.availableDays.map((day) => <span key={day} className="rounded-full border px-2 py-0.5 text-xs">{day[0] + day.slice(1).toLowerCase()}</span>)}</dd>
                </div>}
              </dl>
            </section>
          </div>

          <div className="shrink-0 space-y-4 border-t bg-popover px-6 py-4">
            <div className="flex items-start gap-2 text-muted-foreground">
              <LockSimple aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <DialogDescription className="text-xs leading-relaxed">Contact the Registrar to update faculty information.</DialogDescription>
            </div>
            <div className="flex gap-2 sm:justify-end">
              <Button variant="outline" onClick={onClose} className="h-10 flex-1 sm:flex-none sm:px-5">Close</Button>
              <Link href={`/scheduler?facultyId=${faculty.id}`} className={buttonVariants({ className: "h-10 flex-1 sm:flex-none sm:px-5" })}>
                <CalendarBlank aria-hidden />View timetable
              </Link>
            </div>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
