"use client";

import { EntityCrud } from "@/components/admin/entity-crud";
import { Badge } from "@/components/ui/badge";
import { createAcademicYearAction, updateAcademicYearAction, deleteAcademicYearAction } from "./actions";

interface Row {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: string;
}

export function AcademicYearsManager({ years }: { years: Row[] }) {
  return (
    <EntityCrud
      title="Academic Year"
      rows={years}
      columns={[
        { key: "name", label: "Name" },
        { key: "startDate", label: "Start Date" },
        { key: "endDate", label: "End Date" },
        {
          key: "isActive",
          label: "Status",
          render: (r) => (r.isActive === "true" ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
        },
      ]}
      fields={[
        { name: "name", label: "Name (e.g. 2026-2027)", type: "text", required: true },
        { name: "startDate", label: "Start Date", type: "date", required: true },
        { name: "endDate", label: "End Date", type: "date", required: true },
        { name: "isActive", label: "Set as active academic year", type: "checkbox" },
      ]}
      onCreate={createAcademicYearAction}
      onUpdate={updateAcademicYearAction}
      onDelete={deleteAcademicYearAction}
      deleteLabel={(r) => `This removes "${r.name}" permanently.`}
    />
  );
}
