import { prisma } from "@/lib/db/prisma";
import { requireStudent } from "@/lib/auth/session";
import { isoDate } from "@/lib/occupancy/engine";
import { stageLabel } from "@/lib/academics/levels";
import { formatRange } from "@/lib/scheduler/timetable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ux/states";
import { ActivitiesReportButtons, RoomAssignmentsReportButtons, TimetableReportButtons } from "@/components/ux/export-buttons";
import { PortalHeader } from "@/components/student/portal-header";
import { activeTermLabel } from "@/lib/academics/term-label";

export const metadata = { title: "Student Portal · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const ROOM_TYPES: Record<string, string> = {
  LECTURE_ROOM: "Lecture room",
  COMPUTER_LABORATORY: "Computer laboratory",
  SCIENCE_LABORATORY: "Science laboratory",
  CONFERENCE_ROOM: "Conference room",
  OTHER: "Other",
};
const ACTIVITY_TYPES: Record<string, string> = { SCHOOL_EVENT: "School event", HOLIDAY: "Holiday", CLASS_SUSPENSION: "Class suspension" };

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** View-only portal: the signed-in student's own section timetable, rooms, and school activities. */
export default async function StudentPortalPage() {
  const user = await requireStudent();
  // Everything below is read through the student's own record; no other section is ever queried.
  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    select: {
      studentNumber: true,
      section: {
        select: {
          id: true,
          name: true,
          level: true,
          yearLevel: true,
          gradeLevel: true,
          program: { select: { code: true, name: true } },
          semester: { select: { name: true, startDate: true, endDate: true, academicYear: { select: { name: true } } } },
        },
      },
    },
  });
  const section = student?.section;

  if (!section) {
    return (
      <div className="min-h-screen bg-background">
        <PortalHeader name={user.name ?? ""} />
        <main className="mx-auto max-w-5xl p-4 md:p-6">
          <EmptyState title="No section on file" description="Your section was removed or is not set. Ask the Administrator to assign your section." />
        </main>
      </div>
    );
  }

  // Basic-education sections have no semester of their own; they follow the active terms of their level.
  const levelTerms = section.semester
    ? [section.semester]
    : await prisma.semester.findMany({ where: { isActive: true, level: section.level }, select: { startDate: true, endDate: true } });
  const term = section.semester ? `${section.semester.academicYear.name} · ${section.semester.name}` : await activeTermLabel(section.level);
  // Activities of the active terms; none when the level has no active term.
  const from = new Date(Math.min(...levelTerms.map((t) => t.startDate.getTime())));
  const to = new Date(Math.max(...levelTerms.map((t) => t.endDate.getTime())));
  const [classes, activities] = await Promise.all([
    prisma.schedule.findMany({
      where: { sectionId: section.id, status: "PUBLISHED" },
      select: {
        dayOfWeek: true,
        startMin: true,
        endMin: true,
        component: true,
        subject: { select: { code: true, name: true } },
        faculty: { select: { fullName: true } },
        room: { select: { roomName: true, roomType: true, floor: { select: { name: true, building: { select: { name: true } } } } } },
      },
    }),
    levelTerms.length === 0 ? [] : prisma.activity.findMany({
      where: {
        startDate: { lte: to },
        endDate: { gte: from },
        // Suspensions for other sections are not shown.
        OR: [{ type: { not: "CLASS_SUSPENSION" } }, { sectionIds: { isEmpty: true } }, { sectionIds: { has: section.id } }],
      },
      orderBy: { startDate: "asc" },
      select: { type: true, title: true, description: true, startDate: true, endDate: true, startMin: true, endMin: true },
    }),
  ]);

  const timetable = classes
    .map((c) => ({
      dayOfWeek: c.dayOfWeek,
      startMin: c.startMin,
      endMin: c.endMin,
      subject: `${c.subject.code} - ${c.subject.name}`,
      component: c.component,
      section: section.name,
      faculty: c.faculty.fullName,
      room: c.room.roomName,
    }))
    .sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startMin - b.startMin);

  const rooms = new Map<string, { room: string; location: string; type: string; subjects: Set<string> }>();
  for (const c of classes) {
    const entry = rooms.get(c.room.roomName) ?? {
      room: c.room.roomName,
      location: c.room.floor ? `${c.room.floor.building.name}, ${c.room.floor.name}` : "",
      type: ROOM_TYPES[c.room.roomType] ?? c.room.roomType,
      subjects: new Set<string>(),
    };
    entry.subjects.add(c.subject.code);
    rooms.set(c.room.roomName, entry);
  }
  const roomRows = [...rooms.values()].map((r) => ({ ...r, subjects: [...r.subjects].join(", ") })).sort((a, b) => a.room.localeCompare(b.room));
  const activityRows = activities.map((a) => ({ ...a, description: a.description ?? "", startDate: isoDate(a.startDate), endDate: isoDate(a.endDate) }));
  const slug = section.name.replace(/\W+/g, "-").toLowerCase();

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader name={user.name ?? ""} />
      <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Section {section.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[section.program ? `${section.program.code} - ${section.program.name}` : null, stageLabel(section), term, `Student number ${student!.studentNumber}`].filter(Boolean).join(" · ")}
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Class timetable</CardTitle>
            <TimetableReportButtons title={`Class Timetable: ${section.name}`} term={term} rows={timetable} filename={`class-timetable-${slug}`} />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {timetable.length === 0 ? (
              <EmptyState title="No published classes yet" description="Your timetable appears here once it is published." className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Room</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timetable.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{titleCase(r.dayOfWeek)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatRange(r.startMin, r.endMin)}</TableCell>
                      <TableCell>
                        {r.subject}
                        {r.component === "LABORATORY" && <span className="text-muted-foreground"> (Laboratory)</span>}
                      </TableCell>
                      <TableCell>{r.faculty}</TableCell>
                      <TableCell>{r.room}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Room assignments</CardTitle>
            <RoomAssignmentsReportButtons title={`Room Assignments: ${section.name}`} term={term} rows={roomRows} filename={`room-assignments-${slug}`} />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {roomRows.length === 0 ? (
              <EmptyState title="No rooms assigned yet" className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Building and floor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Subjects held here</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roomRows.map((r) => (
                    <TableRow key={r.room}>
                      <TableCell className="font-medium">{r.room}</TableCell>
                      <TableCell>{r.location}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>{r.subjects}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>School activities</CardTitle>
            <ActivitiesReportButtons title={`School Activities: ${section.name}`} term={term} rows={activityRows} filename={`school-activities-${slug}`} />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {activityRows.length === 0 ? (
              <EmptyState title="No activities this term" className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityRows.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{a.startDate === a.endDate ? a.startDate : `${a.startDate} to ${a.endDate}`}</TableCell>
                      <TableCell>
                        <p className="font-medium">{a.title}</p>
                        {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                      </TableCell>
                      <TableCell>{ACTIVITY_TYPES[a.type] ?? a.type}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
