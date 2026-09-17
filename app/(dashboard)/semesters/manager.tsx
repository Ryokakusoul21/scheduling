"use client";

import { EntityCrud } from "@/components/admin/entity-crud";
import { Badge } from "@/components/ui/badge";
import { createSemesterAction, updateSemesterAction, deleteSemesterAction } from "./actions";

interface Row {
  id: string;
  academicYearId: string;
  academicYearLabel: string;
  type: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: string;
}

export function SemestersManager({
  semesters,
  years,
}: {
  semesters: Row[];
  years: { id: string; label: string }[];
}) {
  return (
    <EntityCrud
      title="Semester"
      rows={semesters}
      columns={[
        { key: "academicYearLabel", label: "Academic Year" },
        { key: "name", label: "Semester" },
        { key: "startDate", label: "Start" },
        { key: "endDate", label: "End" },
        {
          key: "isActive",
          label: "Status",
          render: (r) => (r.isActive === "true" ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
        },
      ]}
      fields={[
        {
          name: "academicYearId",
          label: "Academic Year",
          type: "select",
          required: true,
          options: years.map((y) => ({ value: y.id, label: y.label })),
        },
        {
          name: "type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "FIRST", label: "First Semester" },
            { value: "SECOND", label: "Second Semester" },
            { value: "SUMMER", label: "Summer" },
          ],
        },
        { name: "name", label: "Display Name", type: "text", required: true },
        { name: "startDate", label: "Start Date", type: "date", required: true },
        { name: "endDate", label: "End Date", type: "date", required: true },
        { name: "isActive", label: "Set as active semester", type: "checkbox" },
      ]}
      onCreate={createSemesterAction}
      onUpdate={updateSemesterAction}
      onDelete={deleteSemesterAction}
      deleteLabel={(r) => `This removes "${r.name}" from ${r.academicYearLabel}.`}
    />
  );
}
