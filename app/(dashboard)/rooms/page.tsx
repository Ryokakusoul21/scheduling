import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { RoomsManager } from "./manager";

export const metadata = { title: "Rooms · GCST Scheduling" };

export default async function RoomsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR", "REGISTRAR");
  const rooms = await prisma.room.findMany({
    include: { schedules: { select: { startMin: true, endMin: true } } },
    orderBy: { roomNumber: "asc" },
  });

  const AVAILABLE_MIN_PER_WEEK = 6 * 12 * 60;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rooms</h1>
        <p className="text-sm text-muted-foreground">Facility inventory, capacity, and current utilization.</p>
      </div>

      <RoomsManager
        rooms={rooms.map((r) => {
          const bookedMin = r.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0);
          const utilization = Math.round((bookedMin / AVAILABLE_MIN_PER_WEEK) * 100);
          return {
            id: r.id,
            roomNumber: r.roomNumber,
            roomName: r.roomName,
            building: r.building ?? "",
            capacity: String(r.capacity),
            roomType: r.roomType,
            status: r.status,
            equipment: r.equipment.join(", "),
            utilization: Math.min(utilization, 100),
          };
        })}
      />
    </div>
  );
}
