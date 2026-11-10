import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { DEMO_STAFF, DEMO_STUDENTS, type DemoAccount } from "@/lib/auth/demo-accounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ux/states";
import { ViewAsButton } from "@/components/layout/view-as";

export const metadata = { title: "View as Another Role · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

/** Administrator tool to see the system exactly as each sample account does, read-only. */
export default async function ViewAsPage() {
  await requireRole("SUPER_ADMINISTRATOR");
  const accounts = [...DEMO_STAFF, ...DEMO_STUDENTS].filter((a) => !a.label.startsWith("Administrator"));
  const users = await prisma.user.findMany({ where: { email: { in: accounts.map((a) => a.email) }, status: "ACTIVE", archivedAt: null }, select: { id: true, email: true, name: true, role: true } });
  const byEmail = new Map(users.map((u) => [u.email, u]));

  const group = (title: string, list: DemoAccount[]) => (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y border-t">
          {list.map((a) => {
            const u = byEmail.get(a.email);
            return (
              <li key={a.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{a.label}{u?.name && <span className="font-normal text-muted-foreground"> · {u.name}</span>}</p>
                  <p className="text-xs text-muted-foreground">{a.sees}</p>
                </div>
                {u ? <ViewAsButton userId={u.id} label={a.label} /> : <span className="text-xs text-muted-foreground">Account not found; run the sample data seed.</span>}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="View as Another Role" description="Check what each role sees, using the sample accounts. Viewing is read-only: nothing can be saved, approved, or deleted. A banner at the top takes you back to your own account. Every view is recorded in the Audit Logs." />
      {group("Staff", accounts.filter((a) => DEMO_STAFF.includes(a)))}
      {group("Students", DEMO_STUDENTS)}
    </div>
  );
}
