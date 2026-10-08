import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { roleLabel, type AppRole } from "@/lib/permissions/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SecuritySettings } from "./security-settings";

export const metadata = { title: "Profile · GCST Scheduling" };

export default async function ProfilePage() {
  const { id } = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });

  const details = [
    ["Name", user.name],
    ["Email", user.email],
    ["Role", roleLabel(user.role as AppRole)],
    ["Last sign-in", user.lastLoginAt?.toLocaleString("en-PH", { timeZone: "Asia/Manila" }) ?? "—"],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account details and security settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <SecuritySettings twoFactorEnabled={user.twoFactorEnabled} />
    </div>
  );
}
