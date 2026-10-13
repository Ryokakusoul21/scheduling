import { getScope } from "@/lib/permissions/scope";
import { workloadView } from "@/lib/workload/view";
import { PageHeader } from "@/components/ux/states";
import { LiveRefresh } from "@/components/ux/live-refresh";
import { WorkloadBoard } from "./workload-board";

export const metadata = { title: "Faculty Workload · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function WorkloadPage() {
  const scope = await getScope();
  const staff = scope.role !== "FACULTY";
  const view = await workloadView(scope, { history: 50 });
  const range = `${view.limits.minimum} to ${view.limits.maximum} ${view.limits.measure === "HOURS" ? "weekly hours" : "units"}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={staff ? "Faculty Workload" : "My Teaching Load"}
        description={
          staff
            ? `Teaching loads in the active terms against the allowed ${range}. Every schedule change rechecks all loads and ${view.limits.mode === "AUTOMATIC" ? "applies fixes right away" : "proposes fixes for approval"}.`
            : `Your teaching load in the active terms against the allowed ${range}. You are notified whenever it changes.`
        }
        actions={<LiveRefresh />}
      />
      <WorkloadBoard
        staff={staff}
        measure={view.limits.measure}
        mode={view.limits.mode}
        status={view.status ? { checkedAt: view.status.checkedAt, trigger: view.status.trigger } : null}
        flags={view.flags}
        rows={view.rows}
        proposals={view.proposals}
        fixes={view.fixes}
      />
    </div>
  );
}
