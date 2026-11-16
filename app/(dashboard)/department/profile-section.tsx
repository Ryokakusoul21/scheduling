import type { Scope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/ux/states";
import { DepartmentProfiles } from "./profile-editor";

/** Profile editor for the departments the scope can manage; shared by the profile page and Academic Programs. */
export async function ProfileSection({ scope, initialId }: { scope: Scope; initialId?: string }) {
  const departments = await prisma.department.findMany({
    where: departmentWhere.department(scope),
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, logoUrl: true, updatedAt: true,
      _count: { select: { programs: true, faculty: true, sections: true, rooms: true } },
    },
  });
  if (!departments.length) return <EmptyState title="No department assigned" description="Ask the Registrar to assign your department before editing its profile." />;
  return <DepartmentProfiles initialId={initialId} departments={departments.map(({ _count, updatedAt, ...department }) => ({
    ...department, counts: _count, updatedAt: updatedAt.toISOString(),
  }))} />;
}
