import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { SettingsManager } from "./manager";

export const metadata = { title: "System Settings · GCST Scheduling" };

export default async function SettingsPage() {
  await requireRole("SUPER_ADMIN", "ADMINISTRATOR");

  const [institutionSetting, constraints] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "institution" } }),
    prisma.schedulingConstraint.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
  ]);

  const institution = (institutionSetting?.value as { name?: string; shortName?: string; location?: string } | undefined) ?? {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Settings</h1>
        <p className="text-sm text-muted-foreground">Institution details and scheduling constraint configuration.</p>
      </div>

      <SettingsManager
        institution={{
          name: institution.name ?? "Granby Colleges of Science & Technology",
          shortName: institution.shortName ?? "GCST",
          location: institution.location ?? "Naic, Cavite",
        }}
        constraints={constraints.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          weight: c.weight,
          isActive: c.isActive,
        }))}
      />
    </div>
  );
}
