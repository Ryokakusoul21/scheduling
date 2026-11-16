import { redirect } from "next/navigation";
import { requireScope } from "@/lib/permissions/scope";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { AssignmentApprovalsSection } from "./assignment-approvals-section";

export const metadata = { title: "Subject Assignment Approvals · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function AssignmentApprovalsPage() {
  const scope = await requireScope(...STAFF_ROLES);
  if (scope.isAdmin) redirect("/admin/review-center?queue=subject-assignments");
  return <AssignmentApprovalsSection scope={scope} />;
}
