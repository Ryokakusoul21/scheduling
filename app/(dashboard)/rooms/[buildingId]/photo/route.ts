import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/permissions/roles";

/** Serves a building photo to staff; the version query lets browsers cache it until the next upload. */
export async function GET(_request: Request, { params }: { params: Promise<{ buildingId: string }> }) {
  await requireRole(...STAFF_ROLES);
  const { buildingId } = await params;
  const building = await prisma.building.findUnique({ where: { id: buildingId }, select: { photo: true, photoType: true } });
  if (!building?.photo || !building.photoType) return new Response("Not found", { status: 404 });
  return new Response(building.photo, {
    headers: { "Content-Type": building.photoType, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
