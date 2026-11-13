import { requireScope } from "@/lib/permissions/scope";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { departmentWhere } from "@/lib/permissions/department";
import { prisma } from "@/lib/db/prisma";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { DepartmentProfiles } from "./profile-editor";

export const metadata = { title: "Department Profile · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function DepartmentProfilePage({ searchParams }: { searchParams: Promise<{ department?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const [params, departments] = await Promise.all([
    searchParams,
    prisma.department.findMany({ where: departmentWhere.department(scope), orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, logoUrl: true, updatedAt: true,
        _count: { select: { programs: true, faculty: true, sections: true, rooms: true } },
      },
    }),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Department Profile" description="Update your department’s name and logo." />
      {departments.length ? <DepartmentProfiles departments={departments.map(({ _count, updatedAt, ...department }) => ({
        ...department, counts: _count, updatedAt: updatedAt.toISOString(),
      }))} initialId={params.department} /> : <EmptyState title="No department assigned" description="Ask the Registrar to assign your department before editing its profile." />}
    </div>
  );
}
