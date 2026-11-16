import { requireRole } from "@/lib/auth/session";
import { listArchived } from "@/lib/archive/list";
import { UserTabs } from "../user-tabs";
import { ArchivedList } from "./archived-list";

export const metadata = { title: "Archived Records · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function ArchivedPage() {
  await requireRole("SUPER_ADMINISTRATOR");
  const rows = await listArchived();
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Archived records</h1>
        <p className="text-sm text-muted-foreground">Review archived accounts and academic records. Archived rooms are kept for history; other record types can be restored.</p>
      </div>
      <UserTabs current="archived" archivedCount={rows.length} />
      <ArchivedList rows={rows} />
    </div>
  );
}
