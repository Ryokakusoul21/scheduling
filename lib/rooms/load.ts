import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { departmentWhere } from "@/lib/permissions/department";
import type { Scope } from "@/lib/permissions/scope";
import { photoUrl, type BuildingPurpose } from "./buildings";
import type { Building } from "./rooms";
import { submittedTimetableFilter } from "@/lib/scheduler/visibility";
import { PARAM_SCHEMAS } from "@/lib/scheduler/constraints";

/** Mon to Sat, 7 AM to 7 PM, the week a room's "use this term" is measured against. */
const AVAILABLE_MIN_PER_WEEK = 6 * 12 * 60;

export interface LoadedBuilding extends Building {
  location: string;
  purpose: BuildingPurpose;
  openingMin: number | null;
  closingMin: number | null;
  photo: string | null;
}

/** Room id to the faculty member named by an enabled Room priority constraint. */
async function priorityByRoom() {
  const rules = await prisma.schedulingConstraint.findMany({ where: { kind: "ROOM_PRIORITY", enabled: true }, select: { params: true } });
  const pairs = rules.flatMap((r) => { const p = PARAM_SCHEMAS.ROOM_PRIORITY.safeParse(r.params); return p.success ? [p.data] : []; });
  const faculty = await prisma.faculty.findMany({ where: { id: { in: pairs.map((p) => p.facultyId) } }, select: { id: true, fullName: true } });
  const names = new Map(faculty.map((f) => [f.id, f.fullName]));
  return new Map(pairs.flatMap((p) => names.has(p.facultyId) ? [[p.roomId, names.get(p.facultyId)!] as const] : []));
}

/**
 * Buildings with floors and active rooms (archived rooms left out), without the photo bytes. A Head of
 * Department gets only their department's rooms and shared rooms, and only buildings that hold one.
 */
export async function loadBuildings(scope: Scope, where: Prisma.BuildingWhereInput = {}): Promise<LoadedBuilding[]> {
  const visibleRooms = { archivedAt: null, ...departmentWhere.room(scope) };
  const [rows, priority] = await Promise.all([prisma.building.findMany({
    where: scope.isAdmin ? where : { ...where, floors: { some: { rooms: { some: visibleRooms } } } },
    omit: { photo: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      floors: {
        orderBy: { number: "asc" },
        include: {
          rooms: {
            where: visibleRooms,
            orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }],
            include: {
              department: { select: { name: true } },
              schedules: { where: { status: { not: "ARCHIVED" }, semester: { isActive: true }, ...submittedTimetableFilter(scope.role) }, select: { startMin: true, endMin: true } },
            },
          },
        },
      },
    },
  }), priorityByRoom()]);

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
          departmentName: r.department?.name ?? "",
          isGeneralShared: r.isGeneralShared,
          priorityFaculty: priority.get(r.id),
          utilization: Math.min(Math.round((booked / AVAILABLE_MIN_PER_WEEK) * 100), 100),
        };
      }),
    })),
  }));
}

/** Individual college and school departments for the unified room designation. */
export async function roomFormOptions(scope: Scope) {
  const departments = await prisma.department.findMany({
    where: { code: { notIn: ["BED", "GENED"] } },
    orderBy: { name: "asc" }, select: { id: true, name: true, code: true },
  });
  const schoolOrder = ["SHS", "JHS", "ELEM", "PRE-ELEM"];
  const rank = (code: string) => schoolOrder.includes(code) ? schoolOrder.indexOf(code) + 1 : 0;
  departments.sort((a, b) => rank(a.code) - rank(b.code));
  return {
    departments: (scope.isAdmin ? departments : departments.filter((d) => d.id === scope.departmentId)).map((d) => ({ value: d.id, label: d.name })),
  };
}
