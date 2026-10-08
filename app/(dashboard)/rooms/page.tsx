import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { RoomsExplorer } from "./rooms-explorer";

export const metadata = { title: "Rooms · GCST Scheduling" };

/** Mon–Sat, 7 AM–7 PM. */
const AVAILABLE_MIN_PER_WEEK = 6 * 12 * 60;

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole(...STAFF_ROLES);
  const { q } = await searchParams;
  const buildings = await prisma.building.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      floors: {
        orderBy: { number: "asc" },
        include: {
          rooms: {
            orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }],
            include: {
              schedules: { where: { status: { not: "ARCHIVED" }, semester: { isActive: true } }, select: { startMin: true, endMin: true } },
            },
          },
        },
      },
    },
  });

  return (
    <RoomsExplorer
      initialQuery={q ?? ""}
      buildings={buildings.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code ?? "",
        description: b.description ?? "",
        floors: b.floors.map((f) => ({
          id: f.id,
          buildingId: b.id,
          name: f.name,
          number: f.number,
          rooms: f.rooms.map((r) => {
            const booked = r.schedules.reduce((s, e) => s + (e.endMin - e.startMin), 0);
            return {
              id: r.id,
              floorId: f.id,
              roomNumber: r.roomNumber,
              roomName: r.roomName,
              capacity: r.capacity,
              roomType: r.roomType,
              status: r.status,
              equipment: r.equipment.join(", "),
              utilization: Math.min(Math.round((booked / AVAILABLE_MIN_PER_WEEK) * 100), 100),
            };
          }),
        })),
      }))}
    />
  );
}
