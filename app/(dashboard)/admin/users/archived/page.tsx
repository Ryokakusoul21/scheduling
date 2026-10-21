import { requireRole } from "@/lib/auth/session";
import { listArchived } from "@/lib/archive/list";
import { UserTabs } from "../user-tabs";
import { ArchivedList } from "./archived-list";

export const metadata = { title: "Archived Records · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ArchivedPage() {
  await requireRole("ADMINISTRATOR");
  const rows = await listArchived();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground">Archived accounts, faculty records, subjects, rooms, and sections. Restore brings back the record with all of its past data.</p>
      </div>
      <UserTabs current="archived" archivedCount={rows.length} />
      <ArchivedList rows={rows} />
    </div>
  );
}
