import { STAFF_ROLES } from "@/lib/permissions/roles";
import { requireScope } from "@/lib/permissions/scope";
import { PageHeader } from "@/components/ux/states";
import { ImportWorkspace } from "./import-workspace";

export const metadata = { title: "Bulk Data Import · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireScope(...STAFF_ROLES);
  const { kind } = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Bulk Data Import"
        description="Add many subjects or rooms at once from a CSV or Excel file, or paste rows copied from a spreadsheet. Every row is validated and previewed before saving. To add one at a time, use the Subjects or Rooms page."
      />
      <ImportWorkspace initialKind={kind === "rooms" ? "rooms" : "subjects"} />
    </div>
  );
}
