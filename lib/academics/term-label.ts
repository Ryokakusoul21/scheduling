import "server-only";
import { prisma } from "@/lib/db/prisma";

/** "2026-2027 · First Semester; First Quarter" for the active school year and its active terms. */
export async function activeTermLabel(level?: string) {
  const terms = await prisma.semester.findMany({
    where: { isActive: true, ...(level ? { level: level as never } : {}) },
    select: { name: true, academicYear: { select: { name: true } } },
  });
  if (!terms.length) return "No active term";
  const years = [...new Set(terms.map((t) => t.academicYear.name))].join(", ");
  return `${years} · ${[...new Set(terms.map((t) => t.name))].join("; ")}`;
}
