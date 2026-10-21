import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { activeTermLabel } from "@/lib/academics/term-label";
import { RoomsExplorer } from "./rooms-explorer";

export const metadata = { title: "Rooms · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

/** Mon–Sat, 7 AM–7 PM. */
const AVAILABLE_MIN_PER_WEEK = 6 * 12 * 60;

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const { q } = await searchParams;
  const [departments, programs, termLabel] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.program.findMany({ where: { level: { in: ["COLLEGE", "SENIOR_HIGH"] } }, orderBy: [{ level: "desc" }, { sortOrder: "asc" }], select: { id: true, code: true, name: true } }),
    activeTermLabel(),
  ]);
  const buildings = await prisma.building.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      floors: {
        orderBy: { number: "asc" },
        include: {
          rooms: {
            where: { archivedAt: null },
            orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }],
            include: {
              programs: { select: { id: true } },
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
      isAdmin={scope.isAdmin}
      termLabel={termLabel}
      programs={programs.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
      departments={(scope.isAdmin ? departments : departments.filter((d) => d.id === scope.departmentId)).map((d) => ({ value: d.id, label: d.name }))}
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
              departmentId: r.departmentId ?? "",
              programIds: r.isGeneralShared ? [] : r.programs.map((p) => p.id),
              utilization: Math.min(Math.round((booked / AVAILABLE_MIN_PER_WEEK) * 100), 100),
            };
          }),
        })),
      }))}
    />
  );
}
