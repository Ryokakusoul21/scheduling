"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";

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

/** Persists a drag-and-drop order: each id's sortOrder becomes its index. */
export async function reorderAction(entity: z.infer<typeof schema>["entity"], ids: string[]) {
  await requireRole(...STAFF_ROLES);
  const parsed = schema.safeParse({ entity, ids });
  if (!parsed.success) return { ok: false, error: "Invalid reorder request." };

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
