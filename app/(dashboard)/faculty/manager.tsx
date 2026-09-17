"use client";

import { EntityCrud } from "@/components/admin/entity-crud";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { createFacultyAction, updateFacultyAction, deleteFacultyAction } from "./actions";

interface Row {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  departmentId: string;
  departmentLabel: string;
  position: string;
  specialization: string;
  maxHours: string;
  status: string;
  utilization: number;
  assignedHours: string;
}

export function FacultyManager({
  faculty,
  departments,
}: {
  faculty: Row[];
  departments: { id: string; label: string }[];
}) {
  return (
    <EntityCrud
      title="Faculty"
      rows={faculty}
      columns={[
        { key: "employeeId", label: "ID" },
        { key: "fullName", label: "Name" },
        { key: "departmentLabel", label: "Department" },
        { key: "specialization", label: "Specialization" },
        {
          key: "workload",
          label: "Workload",
          render: (r) => (
            <div className="w-32 space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{r.assignedHours}/{r.maxHours} hrs</span>
                <span>{r.utilization}%</span>
              </div>
              <Progress value={Math.min(r.utilization, 100)} />
            </div>
          ),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>{r.status.replace("_", " ")}</Badge>,
        },
      ]}
      fields={[
        { name: "employeeId", label: "Employee ID", type: "text", required: true },
        { name: "fullName", label: "Full Name", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        {
          name: "departmentId",
          label: "Department",
          type: "select",
          options: [{ value: "", label: "Unassigned" }, ...departments.map((d) => ({ value: d.id, label: d.label }))],
        },
        { name: "position", label: "Position", type: "text" },
        { name: "specialization", label: "Specialization", type: "text" },
        { name: "maxHours", label: "Max Hours / Week", type: "number", required: true, defaultValue: "24" },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "ACTIVE", label: "Active" },
            { value: "INACTIVE", label: "Inactive" },
            { value: "ON_LEAVE", label: "On Leave" },
          ],
        },
      ]}
      onCreate={createFacultyAction}
      onUpdate={updateFacultyAction}
      onDelete={deleteFacultyAction}
      deleteLabel={(r) => `This removes "${r.fullName}".`}
    />
  );
}
