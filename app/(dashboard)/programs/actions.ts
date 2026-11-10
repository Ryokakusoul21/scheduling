"use server";

import { DEFAULT_SHS_STRANDS } from "@/lib/academics/levels";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { OUTSIDE_DEPARTMENT, policyUserFromScope, programDepartment, requireScope } from "@/lib/permissions/scope";
import { can } from "@/lib/permissions/policy";
import { logBlocked } from "@/lib/permissions/department";
import { prisma } from "@/lib/db/prisma";
import { STAFF_ROLES } from "@/lib/permissions/roles";

type Result = { ok: boolean; error?: string };

const schema = z
  .object({
    level: z.enum(["COLLEGE", "SENIOR_HIGH"]),
    code: z.string().trim().min(1, "Code is required").max(20),
    name: z.string().trim().min(1, "Name is required").max(150),
    departmentId: z.string().optional(),
  })
  .refine((d) => d.level !== "SENIOR_HIGH" || DEFAULT_SHS_STRANDS.some((strand) => strand.code === d.code), { message: "Choose STEM, ABM, HUMSS, GAS, ICT, or TVL", path: ["code"] })
  .refine((d) => d.level !== "COLLEGE" || !!d.departmentId, { message: "Choose the department offering this course", path: ["departmentId"] });

const READ_ONLY = "Programs and strands are managed by the Registrar. You can rename your department.";

function revalidate(id?: string) {
  revalidatePath("/programs");
  if (id) revalidatePath(`/programs/${id}`);
  revalidatePath("/scheduler");
}

export async function saveProgramAction(id: string | null, formData: FormData): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const data = { ...parsed.data, departmentId: scope.isAdmin ? parsed.data.departmentId || null : scope.departmentId };
  const who = policyUserFromScope(scope);
  const action = id ? "edit" : "create";
  const allowed = can(who, action, { type: "programCatalog", id, departmentId: data.departmentId }) && (!id || can(who, "edit", { type: "programCatalog", id, departmentId: await programDepartment(id) }));
  if (!allowed) {
    await logBlocked(scope, `${action} a program or strand`, "Program", id);
    return { ok: false, error: READ_ONLY };
  }

  try {
    if (id) {
      await prisma.program.update({ where: { id }, data });
    } else {
      const last = await prisma.program.aggregate({ where: { level: data.level }, _max: { sortOrder: true } });
      await prisma.program.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }
  } catch {
    return { ok: false, error: `A program or strand with the code "${data.code}" already exists.` };
  }
  revalidate(id ?? undefined);
  return { ok: true };
}

export async function deleteProgramAction(id: string): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  if (!can(policyUserFromScope(scope), "archive", { type: "programCatalog", id, departmentId: await programDepartment(id) })) {
    await logBlocked(scope, "delete a program or strand", "Program", id);
    return { ok: false, error: READ_ONLY };
  }
  const [sections, subjects, terms] = await Promise.all([
    prisma.section.count({ where: { programId: id } }),
    prisma.subject.count({ where: { programId: id } }),
    prisma.semester.count({ where: { programId: id } }),
  ]);
  const blockers = [sections && `${sections} section(s)`, subjects && `${subjects} subject(s)`, terms && `${terms} term(s)`].filter(Boolean);
  if (blockers.length) return { ok: false, error: `Still used by ${blockers.join(", ")}. Move or delete those first.` };
  await prisma.program.delete({ where: { id } });
  revalidate();
  return { ok: true };
}

const renameSchema = z.object({ name: z.string().trim().min(2, "Enter the department name").max(100, "Use 100 characters or fewer") });

/** Renames a department; only the name is read from the request, whatever else it carries. */
export async function renameDepartmentAction(departmentId: string, formData: FormData): Promise<Result> {
  const scope = await requireScope(...STAFF_ROLES);
  if (!can(policyUserFromScope(scope), "rename", { type: "department", id: departmentId, departmentId })) {
    await logBlocked(scope, "rename a department outside their own", "Department", departmentId);
    return { ok: false, error: OUTSIDE_DEPARTMENT };
  }
  const parsed = renameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const [current, clash] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } }),
    prisma.department.findFirst({ where: { id: { not: departmentId }, name: { equals: parsed.data.name, mode: "insensitive" } }, select: { id: true } }),
  ]);
  if (!current) return { ok: false, error: "That department no longer exists." };
  if (clash) return { ok: false, error: "Another department already uses that name." };
  if (current.name === parsed.data.name) return { ok: true };

  await prisma.department.update({ where: { id: departmentId }, data: { name: parsed.data.name } });
  await prisma.auditLog.create({
    data: {
      userId: scope.userId, role: scope.role, departmentId, action: "Renamed department", entity: "Department", entityId: departmentId,
      oldValue: { name: current.name }, newValue: { name: parsed.data.name },
    },
  });
  // The name is read from the database on every page, so refreshing the layout updates the header, filters and breadcrumbs.
  revalidatePath("/", "layout");
  return { ok: true };
}
