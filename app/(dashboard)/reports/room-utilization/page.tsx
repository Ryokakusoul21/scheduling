import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Room Utilization · GCST Scheduling" };

const AVAILABLE_MIN_PER_WEEK = 6 * 12 * 60;
const DAY_LABELS: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};

export default async function RoomUtilizationPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR", "SCHEDULER");

  const rooms = await prisma.room.findMany({
    include: { schedules: { where: { status: { not: "ARCHIVED" } } } },
    orderBy: { roomNumber: "asc" },
  });

  const rows = rooms.map((r) => {
    const bookedMin = r.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0);
    const utilization = Math.min(Math.round((bookedMin / AVAILABLE_MIN_PER_WEEK) * 100), 100);

    const byDay = new Map<string, number>();
    for (const s of r.schedules) byDay.set(s.dayOfWeek, (byDay.get(s.dayOfWeek) ?? 0) + (s.endMin - s.startMin));
    const peakDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      id: r.id,
      name: r.roomName,
      number: r.roomNumber,
      capacity: r.capacity,
      type: r.roomType,
      utilization,
      classCount: r.schedules.length,
      peakDay: peakDay ? DAY_LABELS[peakDay[0]] : "—",
    };
  });

  const avgUtilization = rows.length ? Math.round(rows.reduce((s, r) => s + r.utilization, 0) / rows.length) : 0;
  const inUse = rows.filter((r) => r.classCount > 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Room Utilization Report</h1>
        <p className="text-sm text-muted-foreground">Booked hours vs. a 6-day, 12-hour weekly availability window.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{rooms.length}</p><p className="text-xs text-muted-foreground">Total Rooms</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{inUse}</p><p className="text-xs text-muted-foreground">Rooms In Use</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{avgUtilization}%</p><p className="text-xs text-muted-foreground">Average Utilization</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Room Utilization</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Peak Day</TableHead>
                  <TableHead className="w-56">Utilization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name} ({r.number})</TableCell>
                    <TableCell><Badge variant="secondary">{r.type.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>{r.capacity}</TableCell>
                    <TableCell>{r.classCount}</TableCell>
                    <TableCell>{r.peakDay}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress value={r.utilization} />
                        <p className="text-xs text-muted-foreground">{r.utilization}%</p>
                      </div>
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
