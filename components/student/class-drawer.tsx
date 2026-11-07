"use client";

import { Buildings, Clock, EnvelopeSimple, MapPin, User } from "@phosphor-icons/react/ssr";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatRange } from "@/lib/scheduler/timetable";
import { DAY_ENUMS } from "@/lib/student/schedule";
import type { PortalClass } from "@/lib/student/portal";
import { ComponentTag } from "./timetable-parts";

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Read-only details of one subject: every meeting, faculty, rooms, and building location. Esc and the close button dismiss it. */
export function ClassDetailsDrawer({ subjectCode, classes, onClose }: { subjectCode: string | null; classes: PortalClass[]; onClose: () => void }) {
  const meetings = classes
    .filter((c) => c.subjectCode === subjectCode)
    .sort((a, b) => DAY_ENUMS.indexOf(a.dayOfWeek) - DAY_ENUMS.indexOf(b.dayOfWeek) || a.startMin - b.startMin);
  const first = meetings[0];
  const faculty = [...new Map(meetings.map((m) => [m.faculty, m.facultyEmail])).entries()];
  const rooms = [...new Map(meetings.filter((m) => m.room).map((m) => [m.room, m])).values()];

  return (
    <Sheet open={!!first} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {first && (
          <>
            <SheetHeader>
              <SheetTitle className="text-lg">{first.subjectCode}</SheetTitle>
              <SheetDescription className="text-sm">
                {first.subjectName} · {first.units} units
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <section aria-labelledby="drawer-schedule" className="space-y-2">
                <h3 id="drawer-schedule" className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="size-4" aria-hidden /> Schedule
                </h3>
                <ul className="space-y-2">
                  {meetings.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                      <span>
                        <span className="font-medium">{titleCase(m.dayOfWeek)}</span> · {formatRange(m.startMin, m.endMin)}
                        <span className="block text-xs text-muted-foreground">{m.room ?? "Room to be announced"}</span>
                      </span>
                      <ComponentTag component={m.component} />
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="drawer-faculty" className="space-y-2">
                <h3 id="drawer-faculty" className="flex items-center gap-2 text-sm font-semibold">
                  <User className="size-4" aria-hidden /> Faculty
                </h3>
                {faculty.map(([name, email]) => (
                  <div key={name} className="text-sm">
                    <p className="font-medium">{name}</p>
                    <a href={`mailto:${email}`} className="inline-flex min-h-11 items-center gap-1.5 text-primary hover:underline sm:min-h-0">
                      <EnvelopeSimple className="size-4" aria-hidden /> {email}
                    </a>
                  </div>
                ))}
              </section>

              <section aria-labelledby="drawer-rooms" className="space-y-2">
                <h3 id="drawer-rooms" className="flex items-center gap-2 text-sm font-semibold">
                  <Buildings className="size-4" aria-hidden /> Rooms
                </h3>
                {rooms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Room to be announced or held online.</p>
                ) : (
                  rooms.map((r) => (
                    <div key={r.room} className="text-sm">
                      <p className="font-medium">
                        {r.room} <span className="font-normal text-muted-foreground">· {r.roomType}</span>
                      </p>
                      {r.building && (
                        <p className="flex items-start gap-1.5 text-muted-foreground">
                          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                          {[r.building, r.floor, r.buildingLocation].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
