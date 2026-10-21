import "server-only";
import { prisma } from "@/lib/db/prisma";
import { stageLabel } from "@/lib/academics/levels";

/** Section a student can register into, with the keys used by the cascading program and year pickers. */
export interface StudentSectionOption {
  id: string;
  name: string;
  /** Empty for Elementary and Junior High sections, which have no program or strand. */
  programId: string;
  /** Year level (College) or grade level (basic education). */
  stageKey: string;
  stageLabel: string;
}

/** College sections of active terms plus basic-education sections (which follow the quarters of their level); names and levels only. */
export async function registrableSections(): Promise<StudentSectionOption[]> {
  const rows = await prisma.section.findMany({
    where: { archivedAt: null, OR: [{ semester: { isActive: true } }, { semesterId: null }] },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, level: true, programId: true, yearLevel: true, gradeLevel: true },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    programId: s.programId ?? "",
    stageKey: (s.level === "COLLEGE" ? s.yearLevel : s.gradeLevel) ?? "",
    stageLabel: stageLabel(s),
  }));
}
