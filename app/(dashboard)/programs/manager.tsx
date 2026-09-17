"use client";

import { EntityCrud } from "@/components/admin/entity-crud";
import { createProgramAction, updateProgramAction, deleteProgramAction } from "./actions";

interface Row {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  departmentLabel: string;
}

export function ProgramsManager({
  programs,
  departments,
}: {
  programs: Row[];
  departments: { id: string; label: string }[];
}) {
  return (
    <EntityCrud
      title="Program"
      rows={programs}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "departmentLabel", label: "Department" },
      ]}
      fields={[
        { name: "code", label: "Code (e.g. BSIT)", type: "text", required: true },
        { name: "name", label: "Name", type: "text", required: true },
        {
          name: "departmentId",
          label: "Department",
          type: "select",
          required: true,
          options: departments.map((d) => ({ value: d.id, label: d.label })),
        },
      ]}
      onCreate={createProgramAction}
      onUpdate={updateProgramAction}
      onDelete={deleteProgramAction}
      deleteLabel={(r) => `This removes "${r.name}" (${r.code}).`}
    />
  );
}
