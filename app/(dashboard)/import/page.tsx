import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { PageHeader } from "@/components/ux/states";
import { ImportWorkspace } from "./import-workspace";

export const metadata = { title: "Bulk Data Import · GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const scope = await requireScope(...STAFF_ROLES);
  const { kind } = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Bulk Data Import"
        description={scope.isAdmin ? "Import subjects or rooms from a spreadsheet. Review the preview before saving." : "Import subjects from a spreadsheet. Review the preview before saving."}
      />
      <ImportWorkspace initialKind={scope.isAdmin && kind === "rooms" ? "rooms" : "subjects"} allowRooms={scope.isAdmin} />
    </div>
  );
}
