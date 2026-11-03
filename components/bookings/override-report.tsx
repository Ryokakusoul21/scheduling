import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { overrideReport } from "@/lib/bookings/report";

/** Urgent overrides in Timetable Analytics: per department, per room, the most displaced classes, and resolution time. */
export async function OverrideReport({ departmentId }: { departmentId: string | null }) {
  const r = await overrideReport(departmentId);
  const list = (title: string, rows: { label: string; count: number }[], unit: string, counted = "Overrides") => (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>{unit}</TableHead><TableHead className="text-right">{counted}</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((x) => <TableRow key={x.label}><TableCell>{x.label}</TableCell><TableCell className="text-right tabular-nums">{x.count}</TableCell></TableRow>)}</TableBody>
        </Table>
      )}
    </div>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Urgent room overrides (last {r.days} days)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">Overrides</dt><dd className="text-xl font-semibold tabular-nums">{r.total}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Class meetings displaced</dt><dd className="text-xl font-semibold tabular-nums">{r.classesMoved}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Average resolution time</dt><dd className="text-xl font-semibold tabular-nums">{r.averageResolutionHours === null ? "Not yet" : `${r.averageResolutionHours} hours`}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Awaiting faculty response</dt><dd className="text-xl font-semibold tabular-nums">{r.unresolved}</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">Resolution time runs from the override until every affected faculty member acknowledged it or asked for an alternative.</p>
        <div className="grid gap-6 lg:grid-cols-3">
          {list("Per department", r.byDepartment, "Department")}
          {list("Per room", r.byRoom, "Room")}
          {list("Most displaced classes", r.mostDisplaced, "Class", "Times moved")}
        </div>
      </CardContent>
    </Card>
  );
}
