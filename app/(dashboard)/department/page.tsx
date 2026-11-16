import { requireScope } from "@/lib/permissions/scope";
import { STAFF_ROLES } from "@/lib/permissions/roles";
import { PageHeader } from "@/components/ux/states";
import { ProfileSection } from "./profile-section";

export const metadata = { title: "Department Profile · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function DepartmentProfilePage({ searchParams }: { searchParams: Promise<{ department?: string }> }) {
  const [scope, params] = await Promise.all([requireScope(...STAFF_ROLES), searchParams]);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Department Profile" description="Update your department’s name and logo." />
      <ProfileSection scope={scope} initialId={params.department} />
    </div>
  );
}
