"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { OUTSIDE_DEPARTMENT, requireScope, type Scope } from "@/lib/permissions/scope";
import { logBlocked } from "@/lib/permissions/department";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { canManageSubject } from "@/lib/subjects/permissions";
import { canManageSection } from "@/lib/sections/permissions";

const schema = z.object({
  entity: z.enum(["program", "subject", "section", "room", "building"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
});

const PATHS = {
  program: "/programs",
  subject: "/subjects",
  section: "/sections",
  room: "/rooms",
  building: "/rooms",
} as const;

/** True when every record belongs to the Head of Department's department; buildings are the Registrar's. */
async function allOwned(scope: Scope, entity: z.infer<typeof schema>["entity"], ids: string[]) {
  if (entity === "subject") {
    const subjects = await prisma.subject.findMany({ where: { id: { in: ids } }, select: { departmentId: true } });
    return subjects.length === ids.length && subjects.every((subject) => canManageSubject(scope, subject));
  }
  if (entity === "section") {
    const sections = await prisma.section.findMany({ where: { id: { in: ids } }, select: { departmentId: true } });
    return sections.length === ids.length && sections.every((section) => canManageSection(scope, section));
  }
  const where = { id: { in: ids }, departmentId: scope.manageDepartmentId };
  const owned =
    entity === "program" ? await prisma.program.count({ where })
    : entity === "room" ? await prisma.room.count({ where })
    : 0;
  return owned === ids.length;
}

/** Persists a drag-and-drop order: each id's sortOrder becomes its index. */
export async function reorderAction(entity: z.infer<typeof schema>["entity"], ids: string[]) {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse({ entity, ids });
  if (!parsed.success) return { ok: false, error: "Invalid reorder request." };
  // Program and strand order belongs to the Registrar; a Head of Department only reads it.
  if (parsed.data.entity === "program" && !scope.isAdmin) {
    await logBlocked(scope, "reorder programs", "program");
    return { ok: false, error: "Programs and strands are managed by the Registrar." };
  }
  if (!scope.isAdmin && !(await allOwned(scope, parsed.data.entity, parsed.data.ids))) {
    await logBlocked(scope, `reorder ${parsed.data.entity} records outside the department`, parsed.data.entity);
    return { ok: false, error: OUTSIDE_DEPARTMENT };
  }

  const updates = parsed.data.ids.map((id, sortOrder) => {
    const args = { where: { id }, data: { sortOrder } };
    switch (parsed.data.entity) {
      case "program":
        return prisma.program.update(args);
      case "subject":
        return prisma.subject.update(args);
      case "section":
        return prisma.section.update(args);
      case "room":
        return prisma.room.update(args);
      case "building":
        return prisma.building.update(args);
    }
  });

  try {
    await prisma.$transaction(updates);
  } catch {
    return { ok: false, error: "Some items no longer exist. Refresh and try again." };
  }
  revalidatePath(PATHS[parsed.data.entity]);
  return { ok: true };
}
