"use client";

import { EntityCrud } from "@/components/admin/entity-crud";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { createRoomAction, updateRoomAction, deleteRoomAction } from "./actions";

const ROOM_TYPES = [
  { value: "LECTURE_ROOM", label: "Lecture Room" },
  { value: "COMPUTER_LABORATORY", label: "Computer Laboratory" },
  { value: "SCIENCE_LABORATORY", label: "Science Laboratory" },
  { value: "CONFERENCE_ROOM", label: "Conference Room" },
  { value: "OTHER", label: "Other" },
];

interface Row {
  id: string;
  roomNumber: string;
  roomName: string;
  building: string;
  capacity: string;
  roomType: string;
  status: string;
  equipment: string;
  utilization: number;
}

export function RoomsManager({ rooms }: { rooms: Row[] }) {
  return (
    <EntityCrud
      title="Room"
      rows={rooms}
      columns={[
        { key: "roomNumber", label: "Room #" },
        { key: "roomName", label: "Name" },
        { key: "building", label: "Building" },
        { key: "capacity", label: "Capacity" },
        {
          key: "roomType",
          label: "Type",
          render: (r) => <Badge variant="secondary">{r.roomType.replace(/_/g, " ")}</Badge>,
        },
        {
          key: "utilization",
          label: "Utilization",
          render: (r) => (
            <div className="w-28 space-y-1">
              <div className="text-[11px] text-muted-foreground">{r.utilization}%</div>
              <Progress value={r.utilization} />
            </div>
          ),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <Badge variant={r.status === "AVAILABLE" ? "default" : "destructive"}>{r.status.replace(/_/g, " ")}</Badge>
          ),
        },
      ]}
      fields={[
        { name: "roomNumber", label: "Room Number", type: "text", required: true },
        { name: "roomName", label: "Room Name", type: "text", required: true },
        { name: "building", label: "Building", type: "text" },
        { name: "capacity", label: "Capacity", type: "number", required: true, defaultValue: "40" },
        { name: "roomType", label: "Room Type", type: "select", required: true, options: ROOM_TYPES },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "AVAILABLE", label: "Available" },
            { value: "UNDER_MAINTENANCE", label: "Under Maintenance" },
            { value: "UNAVAILABLE", label: "Unavailable" },
          ],
        },
        { name: "equipment", label: "Equipment (comma-separated)", type: "text" },
      ]}
      onCreate={createRoomAction}
      onUpdate={updateRoomAction}
      onDelete={deleteRoomAction}
      deleteLabel={(r) => `This removes "${r.roomName}" (${r.roomNumber}).`}
    />
  );
}
