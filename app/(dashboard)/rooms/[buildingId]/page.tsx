import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { activeTermLabel } from "@/lib/academics/term-label";
import { loadBuildings, roomFormOptions } from "@/lib/rooms/load";
import { RoomsExplorer } from "../rooms-explorer";
import { BuildingBanner } from "./building-banner";

export async function generateMetadata({ params }: { params: Promise<{ buildingId: string }> }) {
  const building = await prisma.building.findUnique({ where: { id: (await params).buildingId }, select: { name: true } });
  return { title: `${building?.name ?? "Building"} · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY` };
}

export default async function BuildingPage({ params, searchParams }: { params: Promise<{ buildingId: string }>; searchParams: Promise<{ q?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const [{ buildingId }, { q }] = await Promise.all([params, searchParams]);
  const [[building], floors, { departments, programs }, termLabel] = await Promise.all([
    loadBuildings({ id: buildingId }),
    // Every floor of every building, so a room can be moved elsewhere.
    prisma.floor.findMany({ orderBy: [{ building: { sortOrder: "asc" } }, { number: "asc" }], select: { id: true, name: true, building: { select: { name: true } } } }),
    roomFormOptions(scope),
    activeTermLabel(),
  ]);
  if (!building) notFound();

  return (
    <div className="space-y-5">
      <BuildingBanner building={building} isAdmin={scope.isAdmin} />
      <RoomsExplorer
        building={building}
        allFloors={floors.map((f) => ({ value: f.id, label: `${f.building.name} — ${f.name}` }))}
        initialQuery={q ?? ""}
        isAdmin={scope.isAdmin}
        termLabel={termLabel}
        departments={departments}
        programs={programs}
      />
    </div>
  );
}
