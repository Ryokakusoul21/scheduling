import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { levelLabel, termLabel } from "@/lib/academics/levels";
import { dashboardAnalytics } from "@/lib/analytics/dashboard";
import { workloadView } from "@/lib/workload/view";
import { AdminAnalytics } from "./admin-analytics";
import { WorkloadBalance } from "./workload-balance";

/**
 * Administrator dashboard analytics and the live Workload Balance panel. Filters live in the address
 * (semester, department, building); LiveRefresh re-renders everything when schedules or fixes change.
 */
export async function AdminPanels({ scope, params }: { scope: Scope; params: { term?: string; department?: string; building?: string } }) {
  const [terms, departments, buildings] = await Promise.all([
    prisma.semester.findMany({ include: { academicYear: { select: { name: true } } }, orderBy: [{ startDate: "desc" }, { level: "asc" }] }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.building.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const term =
    terms.find((t) => t.id === params.term) ?? terms.find((t) => t.isActive && t.level === "COLLEGE") ?? terms.find((t) => t.isActive) ?? terms[0];
  if (!term) return null;
  const departmentId = departments.some((d) => d.id === params.department) ? params.department! : null;
  const buildingId = buildings.some((b) => b.id === params.building) ? params.building! : null;

  const [data, workload] = await Promise.all([dashboardAnalytics({ termId: term.id, departmentId, buildingId }), workloadView(scope, { history: 5 })]);

  return (
    <div className="space-y-5">
      <AdminAnalytics
        data={data}
        filters={{
          term: term.id,
          department: departmentId ?? "",
          building: buildingId ?? "",
          terms: terms.map((t) => ({ value: t.id, label: `${levelLabel(t.level)} · ${termLabel(t.type)} ${t.academicYear.name}${t.isActive ? " (active)" : ""}` })),
          departments: departments.map((d) => ({ value: d.id, label: d.name })),
          buildings: buildings.map((b) => ({ value: b.id, label: b.name })),
        }}
      />
      <WorkloadBalance
        rows={workload.rows}
        measure={workload.limits.measure}
        mode={workload.limits.mode}
        checkedAt={workload.status?.checkedAt ?? null}
        flags={workload.flags}
        fixes={workload.fixes}
        proposals={workload.proposals.filter((p) => p.status === "PENDING")}
      />
    </div>
  );
}
