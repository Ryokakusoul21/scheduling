import { getScope } from "@/lib/permissions/scope";
import { workloadView } from "@/lib/workload/view";
import { PageHeader } from "@/components/ux/states";
import { LiveRefresh } from "@/components/ux/live-refresh";
import { WorkloadBoard } from "./workload-board";

export const metadata = { title: "Faculty Workload · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function WorkloadPage() {
  const scope = await getScope();
  const staff = scope.role !== "FACULTY";
  const view = await workloadView(scope, { history: 50 });
  const range = `${view.limits.minimum} to ${view.limits.maximum} ${view.limits.measure === "HOURS" ? "weekly hours" : "units"}${view.limits.partTimeMinimum !== view.limits.minimum || view.limits.partTimeMaximum !== view.limits.maximum ? ` (part-time ${view.limits.partTimeMinimum} to ${view.limits.partTimeMaximum})` : ""}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={staff ? "Faculty Workload" : "My Teaching Load"}
        description={
          staff
            ? `Teaching loads in the active terms against the allowed ${range}. Every schedule change rechecks all loads and proposes fixes that apply only after Head of Department approval.`
            : `Your teaching load in the active terms against the allowed ${range}. You are notified whenever it changes.`
        }
        actions={<LiveRefresh />}
      />
      <WorkloadBoard
        staff={staff}
        measure={view.limits.measure}
        tolerance={view.limits.tolerance}
        summary={view.summary}
        history={view.history}
        preview={view.preview}
        status={view.status ? { checkedAt: view.status.checkedAt, trigger: view.status.trigger } : null}
        flags={view.flags}
        rows={view.rows}
        proposals={view.proposals}
        fixes={view.fixes}
      />
    </div>
  );
}
