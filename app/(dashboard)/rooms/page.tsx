import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { activeTermLabel } from "@/lib/academics/term-label";
import { loadBuildings, roomFormOptions } from "@/lib/rooms/load";
import { designation, ROOM_TYPES, STATUSES } from "@/lib/rooms/rooms";
import { BuildingsOverview } from "./buildings-overview";

export const metadata = { title: "Buildings and Rooms · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const { q } = await searchParams;
  const [buildings, { programs }, termLabel] = await Promise.all([loadBuildings(), roomFormOptions(scope), activeTermLabel()]);

  return (
    <BuildingsOverview
      initialQuery={q ?? ""}
      isAdmin={scope.isAdmin}
      termLabel={termLabel}
      loadedAt={new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}
      buildings={buildings.map(({ floors, ...b }) => {
        const rooms = floors.flatMap((f) => f.rooms);
        return {
          ...b,
          floors: floors.length,
          rooms: rooms.length,
          seats: rooms.reduce((s, r) => s + r.capacity, 0),
          roomStatuses: rooms.map((r) => r.status),
          roomIndex: rooms.map((r) => ({ id: r.id, text: [r.roomNumber, r.roomName, r.roomType.replace(/_/g, " "), r.equipment].join(" ").toLowerCase() })),
        };
      })}
      roomRows={buildings.flatMap((b) =>
        b.floors.flatMap((f) =>
          f.rooms.map((r) => ({
            buildingId: b.id,
            roomNumber: r.roomNumber,
            roomName: r.roomName,
            location: `${b.name}, ${f.name}`,
            capacity: r.capacity,
            type: ROOM_TYPES.find((t) => t.value === r.roomType)?.label ?? r.roomType,
            designation: designation(r, programs),
            availability: STATUSES.find((t) => t.value === r.status)?.label ?? r.status,
            utilization: r.utilization,
          })),
        ),
      )}
    />
  );
}
