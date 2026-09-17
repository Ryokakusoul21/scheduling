"use client";

import { EntityCrud } from "@/components/admin/entity-crud";
import { Badge } from "@/components/ui/badge";
import { createSubjectAction, updateSubjectAction, deleteSubjectAction } from "./actions";

const ROOM_TYPES = [
  { value: "LECTURE_ROOM", label: "Lecture Room" },
  { value: "COMPUTER_LABORATORY", label: "Computer Laboratory" },
  { value: "SCIENCE_LABORATORY", label: "Science Laboratory" },
  { value: "CONFERENCE_ROOM", label: "Conference Room" },
  { value: "OTHER", label: "Other" },
];

interface Row {
  id: string;
  code: string;
  name: string;
  description: string;
  units: string;
  lectureHours: string;
  labHours: string;
  requiredRoomType: string;
  programId: string;
  yearLevel: string;
  programLabel: string;
}

export function SubjectsManager({
  subjects,
  programs,
}: {
  subjects: Row[];
  programs: { id: string; label: string }[];
}) {
  return (
    <EntityCrud
      title="Subject"
      rows={subjects}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "programLabel", label: "Program" },
        { key: "units", label: "Units" },
        { key: "hours", label: "Lec/Lab Hrs", render: (r) => `${r.lectureHours}/${r.labHours}` },
        {
          key: "requiredRoomType",
          label: "Room Type",
          render: (r) => <Badge variant="secondary">{r.requiredRoomType.replace(/_/g, " ")}</Badge>,
        },
      ]}
      fields={[
        { name: "code", label: "Code (e.g. IT101)", type: "text", required: true },
        { name: "name", label: "Name", type: "text", required: true },
        { name: "description", label: "Description", type: "text" },
        { name: "units", label: "Units", type: "number", step: "0.5", required: true, defaultValue: "3" },
        { name: "lectureHours", label: "Lecture Hours/Week", type: "number", step: "0.5", required: true, defaultValue: "3" },
        { name: "labHours", label: "Lab Hours/Week", type: "number", step: "0.5", required: true, defaultValue: "0" },
        { name: "requiredRoomType", label: "Required Room Type", type: "select", required: true, options: ROOM_TYPES },
        {
          name: "programId",
          label: "Program (blank = General Education)",
          type: "select",
          options: [{ value: "", label: "General Education (any program)" }, ...programs.map((p) => ({ value: p.id, label: p.label }))],
        },
        {
          name: "yearLevel",
          label: "Year Level (blank = any)",
          type: "select",
          options: [
            { value: "", label: "Any year level" },
            { value: "FIRST", label: "1st Year" },
            { value: "SECOND", label: "2nd Year" },
            { value: "THIRD", label: "3rd Year" },
            { value: "FOURTH", label: "4th Year" },
            { value: "FIFTH", label: "5th Year" },
          ],
        },
      ]}
      onCreate={createSubjectAction}
      onUpdate={updateSubjectAction}
      onDelete={deleteSubjectAction}
      deleteLabel={(r) => `This removes "${r.name}" (${r.code}).`}
    />
  );
}
