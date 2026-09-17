import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Faculty Workload · GCST Scheduling" };

export default async function FacultyWorkloadPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER");

  const faculty = await prisma.faculty.findMany({
    where: { status: "ACTIVE" },
    include: { schedules: { where: { status: { not: "ARCHIVED" } }, include: { subject: true } } },
    orderBy: { fullName: "asc" },
  });

  const rows = faculty.map((f) => {
    const hours = f.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0) / 60;
    const utilization = Math.round((hours / Math.max(f.maxHours, 1)) * 100);
    const category = utilization < 60 ? "Underloaded" : utilization > 100 ? "Overloaded" : "Normal";
    return {
      id: f.id,
      name: f.fullName,
      subjects: new Set(f.schedules.map((s) => s.subject.code)).size,
      hours: hours.toFixed(1),
      maxHours: f.maxHours,
      utilization,
      category,
    };
  });

  const underloaded = rows.filter((r) => r.category === "Underloaded").length;
  const overloaded = rows.filter((r) => r.category === "Overloaded").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faculty Workload Report</h1>
        <p className="text-sm text-muted-foreground">Assigned teaching hours vs. maximum load, computed from live schedule data.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{rows.length}</p><p className="text-xs text-muted-foreground">Active Faculty</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold text-amber-600">{underloaded}</p><p className="text-xs text-muted-foreground">Underloaded</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold text-destructive">{overloaded}</p><p className="text-xs text-muted-foreground">Overloaded</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Faculty Workload</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faculty</TableHead>
                  <TableHead>Assigned Subjects</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead className="w-56">Utilization</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.subjects}</TableCell>
                    <TableCell>{r.hours} / {r.maxHours} hrs</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress value={Math.min(r.utilization, 100)} />
                        <p className="text-xs text-muted-foreground">{r.utilization}%</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.category === "Overloaded" ? "destructive" : r.category === "Underloaded" ? "secondary" : "default"}
                      >
                        {r.category}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
