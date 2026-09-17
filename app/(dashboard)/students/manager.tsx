"use client";

import { EntityCrud } from "@/components/admin/entity-crud";
import { Badge } from "@/components/ui/badge";
import { createStudentAction, updateStudentAction, deleteStudentAction } from "./actions";

interface Row {
  id: string;
  studentNumber: string;
  fullName: string;
  email: string;
  programId: string;
  programLabel: string;
  yearLevel: string;
  sectionId: string;
  sectionLabel: string;
  status: string;
}

export function StudentsManager({
  students,
  programs,
  sections,
}: {
  students: Row[];
  programs: { id: string; label: string }[];
  sections: { id: string; label: string }[];
}) {
  return (
    <EntityCrud
      title="Student"
      rows={students}
      columns={[
        { key: "studentNumber", label: "Student #" },
        { key: "fullName", label: "Name" },
        { key: "programLabel", label: "Program" },
        { key: "sectionLabel", label: "Section" },
        {
          key: "status",
          label: "Status",
          render: (r) => <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>{r.status}</Badge>,
        },
      ]}
      fields={[
        { name: "studentNumber", label: "Student Number", type: "text", required: true },
        { name: "fullName", label: "Full Name", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        {
          name: "programId",
          label: "Program",
          type: "select",
          options: [{ value: "", label: "Unassigned" }, ...programs.map((p) => ({ value: p.id, label: p.label }))],
        },
        {
          name: "yearLevel",
          label: "Year Level",
          type: "select",
          options: [
            { value: "", label: "Unassigned" },
            { value: "FIRST", label: "1st Year" },
            { value: "SECOND", label: "2nd Year" },
            { value: "THIRD", label: "3rd Year" },
            { value: "FOURTH", label: "4th Year" },
            { value: "FIFTH", label: "5th Year" },
          ],
        },
        {
          name: "sectionId",
          label: "Section",
          type: "select",
          options: [{ value: "", label: "Unassigned" }, ...sections.map((s) => ({ value: s.id, label: s.label }))],
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "ACTIVE", label: "Active" },
            { value: "INACTIVE", label: "Inactive" },
            { value: "GRADUATED", label: "Graduated" },
            { value: "DROPPED", label: "Dropped" },
          ],
        },
      ]}
      onCreate={createStudentAction}
      onUpdate={updateStudentAction}
      onDelete={deleteStudentAction}
      deleteLabel={(r) => `This removes "${r.fullName}" (${r.studentNumber}).`}
    />
  );
}
