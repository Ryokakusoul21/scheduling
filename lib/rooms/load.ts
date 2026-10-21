import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { photoUrl, type BuildingPurpose } from "./buildings";
import type { Building } from "./rooms";

/** Mon to Sat, 7 AM to 7 PM, the week a room's "use this term" is measured against. */
const AVAILABLE_MIN_PER_WEEK = 6 * 12 * 60;

export interface LoadedBuilding extends Building {
  location: string;
  purpose: BuildingPurpose;
  openingMin: number | null;
  closingMin: number | null;
  photo: string | null;
}

/** Buildings with floors and active rooms (archived rooms left out), without the photo bytes. */
export async function loadBuildings(where: Prisma.BuildingWhereInput = {}): Promise<LoadedBuilding[]> {
  const rows = await prisma.building.findMany({
    where,
    omit: { photo: true },
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

  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code ?? "",
    description: b.description ?? "",
    location: b.location ?? "",
    purpose: b.purpose,
    openingMin: b.openingMin,
    closingMin: b.closingMin,
    photo: photoUrl(b.id, b.photoUpdatedAt?.getTime().toString() ?? null),
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
  }));
}

/** Departments and programs for the room form, limited to the Head of Department's own department. */
export async function roomFormOptions(scope: { isAdmin: boolean; departmentId: string | null }) {
  const [departments, programs] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.program.findMany({ where: { level: { in: ["COLLEGE", "SENIOR_HIGH"] } }, orderBy: [{ level: "desc" }, { sortOrder: "asc" }], select: { id: true, code: true, name: true } }),
  ]);
  return {
    departments: (scope.isAdmin ? departments : departments.filter((d) => d.id === scope.departmentId)).map((d) => ({ value: d.id, label: d.name })),
    programs: programs.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
  };
}
