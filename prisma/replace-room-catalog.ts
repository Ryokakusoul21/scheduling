import type { Prisma, PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SUPPLIED_ROOM_BUILDINGS, suppliedRoomName, validateRoomCapacities, type RoomOwner } from "./supplied-rooms";

const reason = "Replaced by the supplied Building A, B, C and D room lists.";
const normalize = (number: string) => number.replace(/\s/g, "").toUpperCase();

async function ownerDepartments(db: Prisma.TransactionClient) {
  const programs = await db.program.findMany({ where: { code: { in: ["BSIT", "BSCS", "BSTM", "BEED", "BSED", "BSBA", "BSCRIM"] } }, select: { code: true, departmentId: true } });
  const departmentOf = (code: string) => {
    const id = programs.find((program) => program.code === code)?.departmentId;
    if (!id) throw new Error(`Assign the ${code} program to a department before importing rooms.`);
    return id;
  };
  if (departmentOf("BSIT") !== departmentOf("BSCS")) throw new Error("Confirm which department owns the Information Technology rooms.");
  if (departmentOf("BEED") !== departmentOf("BSED")) throw new Error("Confirm which department owns the Education rooms.");
  const [elementary, preElementary, juniorHigh] = await Promise.all(
    ["ELEM", "PRE-ELEM", "JHS"].map((code) => db.department.findUniqueOrThrow({ where: { code }, select: { id: true } })),
  );
  return { IT: departmentOf("BSIT"), BSTM: departmentOf("BSTM"), EDUC: departmentOf("BEED"), BSBA: departmentOf("BSBA"), BSCRIM: departmentOf("BSCRIM"), ELEM: elementary.id, NKP: preElementary.id, JUNIOR_HS: juniorHigh.id, FACULTY: null } satisfies Record<RoomOwner, string | null>;
}

export async function previewRoomCatalog(db: PrismaClient, capacities: Record<string, number>) {
  const numbers = SUPPLIED_ROOM_BUILDINGS.flatMap((building) => building.rooms.map((room) => room.number));
  return {
    buildings: SUPPLIED_ROOM_BUILDINGS.map((building) => ({ name: building.name, rooms: building.rooms.length })),
    totalRooms: numbers.length,
    capacitiesNeeded: numbers.filter((number) => !Object.hasOwn(capacities, number)),
    previousActiveRooms: await db.room.count({ where: { archivedAt: null, roomNumber: { notIn: numbers } } }),
    history: "Previous room records are archived; schedule and booking links are retained.",
  };
}

export async function verifyRoomCatalog(db: Prisma.TransactionClient, capacities: Record<string, number>) {
  validateRoomCapacities(capacities);
  const departments = await ownerDepartments(db);
  const rows = await db.room.findMany({ where: { archivedAt: null }, include: { floor: { include: { building: { select: { code: true, name: true } } } } } });
  const expectedCount = SUPPLIED_ROOM_BUILDINGS.reduce((sum, building) => sum + building.rooms.length, 0);
  if (rows.length !== expectedCount) throw new Error(`Expected ${expectedCount} active rooms; found ${rows.length}.`);
  for (const building of SUPPLIED_ROOM_BUILDINGS) {
    for (const room of building.rooms) {
      const actual = rows.find((row) => row.roomNumber === room.number);
      if (!actual || actual.roomName !== suppliedRoomName(room) || actual.roomType !== room.type || actual.capacity !== capacities[room.number]
        || actual.departmentId !== (room.owner ? departments[room.owner] : null)
        || actual.floor?.number !== room.floor || actual.floor.building.code !== building.code || actual.floor.building.name !== building.name) {
        throw new Error(`The imported record does not match ${room.number}.`);
      }
      if (!actual.capacity && actual.status !== "UNAVAILABLE") throw new Error(`${room.number} needs capacity before becoming available.`);
    }
  }
  return SUPPLIED_ROOM_BUILDINGS.map((building) => ({ building: building.name, rooms: building.rooms.length }));
}

/** Replace the catalog without reassigning or deleting rooms used by existing schedules and bookings. */
export async function replaceRoomCatalog(db: PrismaClient, capacities: Record<string, number>) {
  validateRoomCapacities(capacities);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261114, 5600)`;
    const departments = await ownerDepartments(tx);
    const [buildings, floors, rooms] = await Promise.all([
      tx.building.findMany({ omit: { photo: true } }),
      tx.floor.findMany(),
      tx.room.findMany({ include: { availability: true, programs: { select: { id: true } } } }),
    ]);
    const duplicates = rooms.filter((room, index) => rooms.findIndex((other) => normalize(other.roomNumber) === normalize(room.roomNumber)) !== index);
    if (duplicates.length) throw new Error("Resolve duplicate room numbers before importing.");
    const directory = resolve("uploads/room-backups");
    await mkdir(directory, { recursive: true });
    const backupPath = resolve(directory, `rooms-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify({ savedAt: new Date().toISOString(), reason, buildings, floors, rooms }, null, 2), { flag: "wx" });

    const importedIds: string[] = [];
    for (const [buildingIndex, source] of SUPPLIED_ROOM_BUILDINGS.entries()) {
      const named = buildings.find((building) => building.name === source.name);
      const coded = buildings.filter((building) => building.code === source.code);
      if (!named && coded.length > 1) throw new Error(`Multiple buildings use code ${source.code}; resolve this before importing.`);
      const existing = named ?? coded[0];
      const building = existing
        ? await tx.building.update({ where: { id: existing.id }, data: { name: source.name, code: source.code, sortOrder: buildingIndex } })
        : await tx.building.create({ data: { name: source.name, code: source.code, sortOrder: buildingIndex } });
      const floorIds = new Map<number, string>();
      for (const number of new Set(source.rooms.map((room) => room.floor))) {
        const name = ["First Floor", "Second Floor", "Third Floor", "Fourth Floor"][number - 1];
        const existingFloor = floors.find((floor) => floor.buildingId === building.id && floor.number === number);
        const floor = existingFloor
          ? await tx.floor.update({ where: { id: existingFloor.id }, data: { name, number } })
          : await tx.floor.create({ data: { buildingId: building.id, name, number } });
        floorIds.set(number, floor.id);
      }
      for (const [index, room] of source.rooms.entries()) {
        const existingRoom = rooms.find((row) => normalize(row.roomNumber) === room.number);
        const capacity = capacities[room.number];
        const data = { roomNumber: room.number, roomName: suppliedRoomName(room), floorId: floorIds.get(room.floor)!, roomType: room.type,
          capacity, departmentId: room.owner ? departments[room.owner] : null,
          isGeneralShared: !room.owner || departments[room.owner] === null, sortOrder: index,
          archivedAt: null, archivedById: null, archiveReason: null,
        };
        const saved = existingRoom
          ? await tx.room.update({ where: { id: existingRoom.id }, data: { ...data, status: capacity === 0 ? "UNAVAILABLE" : existingRoom.status } })
          : await tx.room.create({ data: { ...data, equipment: [], status: capacity === 0 ? "UNAVAILABLE" : "AVAILABLE" } });
        importedIds.push(saved.id);
      }
    }
    const archived = await tx.room.updateMany({ where: { id: { notIn: importedIds }, archivedAt: null }, data: { archivedAt: new Date(), archiveReason: reason, status: "UNAVAILABLE" } });
    await verifyRoomCatalog(tx, capacities);
    const result = { rooms: importedIds.length, buildings: SUPPLIED_ROOM_BUILDINGS.length, archivedRooms: archived.count, backupPath };
    await tx.auditLog.create({ data: { action: "Replaced room catalog from supplied building room images", entity: "Room", reason, newValue: result } });
    return result;
  }, { timeout: 120000, maxWait: 10000 });
}
