import { loadStudentPortal } from "@/lib/student/portal";
import { formatRange } from "@/lib/scheduler/timetable";
import { DAY_ENUMS } from "@/lib/student/schedule";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ux/states";
import { NoSectionState, StudentPageHeader } from "@/components/student/page-header";

export const metadata = { title: "Subjects · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

const shortDay = (d: string) => d.charAt(0) + d.slice(1, 3).toLowerCase();

/** Enrolled subjects of the student's section with faculty and a schedule summary. */
export default async function StudentSubjectsPage() {
  const portal = await loadStudentPortal();
  if (!portal.section) return <NoSectionState />;

  const subjects = new Map<string, { code: string; name: string; units: number; faculty: Set<string>; meetings: typeof portal.classes }>();
  for (const c of portal.classes) {
    const s = subjects.get(c.subjectCode) ?? { code: c.subjectCode, name: c.subjectName, units: c.units, faculty: new Set<string>(), meetings: [] };
    s.faculty.add(c.faculty);
    s.meetings.push(c);
    subjects.set(c.subjectCode, s);
  }
  const list = [...subjects.values()].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-4">
      <StudentPageHeader title="Subjects" portal={portal} />
      {list.length === 0 ? (
        <EmptyState title="No subjects yet" description="Your subjects appear here once your timetable is published." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <li key={s.code}>
              <Card className="h-full">
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{s.code}</p>
                      <p className="text-sm">{s.name}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{s.units} units</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{[...s.faculty].join(", ")}</p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {s.meetings
                      .sort((a, b) => DAY_ENUMS.indexOf(a.dayOfWeek) - DAY_ENUMS.indexOf(b.dayOfWeek) || a.startMin - b.startMin)
                      .map((m) => (
                        <li key={m.id}>
                          {shortDay(m.dayOfWeek)} {formatRange(m.startMin, m.endMin)}
                          {m.component === "LABORATORY" ? " · Laboratory" : ""}
                        </li>
                      ))}
                  </ul>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
