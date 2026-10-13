import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { SettingsManager } from "./manager";
import { SETTING_REQUIRE_APPROVAL } from "@/lib/auth/config";
import { getWorkloadSettings } from "@/lib/settings";

export const metadata = { title: "System Settings · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function SettingsPage() {
  await requireRole("ADMINISTRATOR");

  const [institutionSetting, approvalSetting, workload] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "institution" } }),
    prisma.systemSetting.findUnique({ where: { key: SETTING_REQUIRE_APPROVAL } }),
    getWorkloadSettings(),
  ]);

  const institution = (institutionSetting?.value as { name?: string; location?: string } | undefined) ?? {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Settings</h1>
        <p className="text-sm text-muted-foreground">Institution details, teaching load limits, and registration settings.</p>
      </div>

      <SettingsManager
        institution={{
          name: institution.name ?? "GRANBY COLLEGES OF SCIENCE & TECHNOLOGY",
          location: institution.location ?? "Naic, Cavite",
        }}
        requireApproval={approvalSetting?.value === true}
        workload={workload}
      />
    </div>
  );
}
