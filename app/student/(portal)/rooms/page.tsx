import { loadStudentPortal } from "@/lib/student/portal";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ux/states";
import { RoomAssignmentsReportButtons } from "@/components/ux/export-buttons";
import { NoSectionState, StudentPageHeader } from "@/components/student/page-header";

export const metadata = { title: "Rooms · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** Rooms where the student's section meets. */
export default async function StudentRoomsPage() {
  const portal = await loadStudentPortal();
  if (!portal.section) return <NoSectionState />;
  const rooms = new Map<string, { room: string; location: string; type: string; subjects: Set<string> }>();
  for (const c of portal.classes) {
    if (!c.room) continue;
    const entry = rooms.get(c.room) ?? { room: c.room, location: c.building ? `${c.building}, ${c.floor}` : "", type: c.roomType ?? "", subjects: new Set<string>() };
    entry.subjects.add(c.subjectCode);
    rooms.set(c.room, entry);
  }
  const rows = [...rooms.values()].map((r) => ({ ...r, subjects: [...r.subjects].join(", ") })).sort((a, b) => a.room.localeCompare(b.room));
  const section = portal.section.name;

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title="Rooms"
        portal={portal}
        actions={<RoomAssignmentsReportButtons title={`Room Assignments: ${section}`} term={portal.term} rows={rows} filename={`room-assignments-${section.replace(/\W+/g, "-").toLowerCase()}`} />}
      />
      <Card>
        <CardContent>
          {rows.length === 0 ? (
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
                {rows.map((r) => (
                  <TableRow key={r.room}>
                    <TableCell className="font-medium">{r.room}</TableCell>
                    <TableCell>{r.location}</TableCell>
                    <TableCell>{r.type}</TableCell>
                    <TableCell className="whitespace-normal">{r.subjects}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
