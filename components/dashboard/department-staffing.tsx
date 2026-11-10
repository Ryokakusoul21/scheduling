import Link from "next/link";
import { ArrowRight, Buildings } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DepartmentStaffingRow } from "@/lib/analytics/department-staffing-summary";
import { departmentStaffing } from "@/lib/analytics/department-staffing";

export async function DepartmentStaffingSection({ departments: supplied }: { departments?: DepartmentStaffingRow[] } = {}) {
  const departments = supplied ?? await departmentStaffing();
  const needsAttention = departments.filter((d) => d.recommendationLevel !== "NONE").length;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Buildings className="size-5 text-primary" aria-hidden />
            Department faculty shortage recommendations
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Active-term demand compared with capacity under the configured workload measure.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={needsAttention ? "destructive" : "secondary"}>{needsAttention} departments with staffing indicators</Badge>
          <Link href="/admin/departments" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Department Management <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {departments.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No departments have been created.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1350px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Department</th>
                  <th scope="col" className="px-3 py-2 font-medium">Assessment</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Active faculty</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Assigned load / capacity</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Demand utilization</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Additional capacity needed</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Unassigned classes</th>
                  <th scope="col" className="px-3 py-2 font-medium">Recommended action</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">Department analytics</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {departments.map((department) => {
                  const unit = department.measure === "HOURS" ? "hours" : "units";
                  const status = department.additionalCapacityNeeded > 0
                    ? { label: department.activeFaculty ? "Capacity shortage" : "No active faculty", variant: "destructive" as const }
                    : department.unassignedClasses > 0
                      ? { label: "Reassignment recommended", variant: "outline" as const }
                      : department.overloadedFaculty > 0
                        ? { label: "Rebalance workload", variant: "outline" as const }
                        : department.recommendationLevel === "MONITOR"
                          ? { label: "Near capacity", variant: "outline" as const }
                          : { label: "No shortage indicated", variant: "secondary" as const };
                  const recommendationVariant = department.recommendationLevel === "URGENT" || department.recommendationLevel === "HIGH"
                    ? "destructive" as const
                    : department.recommendationLevel === "NONE"
                      ? "secondary" as const
                      : "outline" as const;
                  return (
                    <tr key={department.id} className="hover:bg-muted/40">
                      <th scope="row" className="px-3 py-3 text-left font-medium">
                        <span className="block">{department.name}</span>
                        <span className="text-xs font-normal text-muted-foreground">{department.code}</span>
                      </th>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-3 py-3 text-right tabular-nums">{department.activeFaculty}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{department.assignedLoad} / {department.capacity} {unit}</td>
                      <td className="px-3 py-3 text-right">
                        <Badge variant={department.utilization !== null && department.utilization > 100 ? "destructive" : department.utilization !== null && department.utilization >= 85 ? "outline" : "secondary"}>
                          {department.utilization === null ? "N/A" : `${department.utilization}%`}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {department.additionalCapacityNeeded ? `${department.additionalCapacityNeeded} ${unit}` : "0"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {department.unassignedClasses ? `${department.unassignedClasses} · ${department.unassignedLoad} ${unit}` : "0"}
                      </td>
                      <td className="min-w-[320px] px-3 py-3">
                        <Badge variant={recommendationVariant}>{department.recommendationLevel === "NONE" ? "NORMAL" : department.recommendationLevel}</Badge>
                        <p className="mt-1 text-xs text-muted-foreground">{department.recommendedAction}</p>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link className="font-medium text-primary hover:underline" href={`/analytics?department=${encodeURIComponent(department.id)}`} aria-label={`View ${department.name} analytics`}>
                          View analytics
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Shortage estimates include assigned and unassigned active-term demand against configured faculty capacity. Faculty-capacity equivalents use each department’s average configured capacity; they are not a hiring headcount target and do not account for subject qualifications or availability.
        </p>
      </CardContent>
    </Card>
  );
}
