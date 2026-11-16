import "server-only";
import { prisma } from "@/lib/db/prisma";

/** The ids among these classes that the Registrar has published; drafts never trigger notices to faculty or students. */
export async function publishedScheduleIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await prisma.schedule.findMany({ where: { id: { in: [...new Set(ids)] }, status: "PUBLISHED" }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}
