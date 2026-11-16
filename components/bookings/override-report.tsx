import { overrideReport } from "@/lib/bookings/report";
import { getScope } from "@/lib/permissions/scope";
import { OverrideReportView } from "./override-report-view";

/** Urgent overrides in Timetable Analytics: per department, per room, the most displaced classes, and resolution time. */
export async function OverrideReport({ departmentId }: { departmentId: string | null }) {
  const data = await overrideReport(await getScope(), departmentId);
  return data ? <OverrideReportView data={data} /> : null;
}
