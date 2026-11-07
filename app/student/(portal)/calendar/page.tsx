import { loadStudentPortal } from "@/lib/student/portal";
import { formatDateRange } from "@/lib/student/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ux/states";
import { ActivitiesReportButtons } from "@/components/ux/export-buttons";
import { ActivityTypeBadge } from "@/components/student/activity-badge";
import { NoSectionState, StudentPageHeader } from "@/components/student/page-header";

export const metadata = { title: "Calendar of Activities · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** Approved school activities for the student's term. */
export default async function StudentCalendarPage() {
  const portal = await loadStudentPortal();
  if (!portal.section) return <NoSectionState />;
  const section = portal.section.name;
  const rows = portal.activities;

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title="Calendar of Activities"
        portal={portal}
        actions={<ActivitiesReportButtons title={`School Activities: ${section}`} term={portal.term} rows={rows} filename={`school-activities-${section.replace(/\W+/g, "-").toLowerCase()}`} />}
      />
      <Card>
        <CardContent>
          {rows.length === 0 ? (
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
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{formatDateRange(a.startDate, a.endDate)}</TableCell>
                    <TableCell className="whitespace-normal">
                      <p className="font-medium">{a.title}</p>
                      {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                    </TableCell>
                    <TableCell>
                      <ActivityTypeBadge type={a.type} />
                    </TableCell>
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
