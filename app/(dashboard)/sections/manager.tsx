"use client";

import { EntityCrud } from "@/components/admin/entity-crud";
import { createSectionAction, updateSectionAction, deleteSectionAction } from "./actions";

interface Row {
  id: string;
  name: string;
  programId: string;
  programLabel: string;
  yearLevel: string;
  studentCount: string;
  semesterId: string;
  semesterLabel: string;
}

export function SectionsManager({
  sections,
  programs,
  semesters,
}: {
  sections: Row[];
  programs: { id: string; label: string }[];
  semesters: { id: string; label: string }[];
}) {
  return (
    <EntityCrud
      title="Section"
      rows={sections}
      columns={[
        { key: "name", label: "Section" },
        { key: "programLabel", label: "Program" },
        { key: "yearLevel", label: "Year Level" },
        { key: "studentCount", label: "Students" },
        { key: "semesterLabel", label: "Semester" },
      ]}
      fields={[
        { name: "name", label: "Section Name (e.g. BSIT 1A)", type: "text", required: true },
        {
          name: "programId",
          label: "Program",
          type: "select",
          required: true,
          options: programs.map((p) => ({ value: p.id, label: p.label })),
        },
        {
          name: "yearLevel",
          label: "Year Level",
          type: "select",
          required: true,
          options: [
            { value: "FIRST", label: "1st Year" },
            { value: "SECOND", label: "2nd Year" },
            { value: "THIRD", label: "3rd Year" },
            { value: "FOURTH", label: "4th Year" },
            { value: "FIFTH", label: "5th Year" },
          ],
        },
        { name: "studentCount", label: "Student Count", type: "number", required: true, defaultValue: "30" },
        {
          name: "semesterId",
          label: "Semester",
          type: "select",
          options: [{ value: "", label: "Unassigned" }, ...semesters.map((s) => ({ value: s.id, label: s.label }))],
        },
      ]}
      onCreate={createSectionAction}
      onUpdate={updateSectionAction}
      onDelete={deleteSectionAction}
      deleteLabel={(r) => `This removes "${r.name}".`}
    />
  );
}
