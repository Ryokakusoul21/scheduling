"use client";

import { roomLabel } from "@/lib/rooms/label";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CaretDown,
  Door,
  MagnifyingGlass,
  Plus,
  Stack,
  X,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ux/action-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmDialog, FormDialog, type ActionResult, type FormField } from "@/components/ux/form-dialog";
import { ArchiveButton } from "@/components/ux/archive-button";
import { EmptyState } from "@/components/ux/states";
import { NativeSelect } from "@/components/ux/native-select";
import { ReportButtons } from "@/components/ux/export-buttons";
import type { ReportDoc } from "@/lib/export/report";
import { useShortcut } from "@/components/ux/shortcuts";
import { cn } from "@/lib/utils";
import { designation, GENERAL, UNASSIGNED, ROOM_TYPES, STATUSES, type Building, type Floor, type Option, type Room } from "@/lib/rooms/rooms";
import {
  deleteFloorAction,
  saveFloorAction,
  saveRoomAction,
} from "./actions";

type Editor =
  | { kind: "floor"; buildingId: string; item?: Floor }
  | { kind: "room"; floorId: string; item?: Room };

type Deleting = { id: string; label: string };

/** Icon chip tint per room type; four muted hues that read in both themes. */
const TYPE_TINT: Record<string, string> = {
  LECTURE_ROOM: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  COMPUTER_LABORATORY: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  SCIENCE_LABORATORY: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  CONFERENCE_ROOM: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  OTHER: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

type RoomListRow =Room & { location: string; designation: string };

/** Floors and rooms of one building: search, department filter, floor and room editing, and the room information list. */
export function RoomsExplorer({
  building,
  allFloors,
  initialQuery,
  isAdmin,
  termLabel,
  departments,
}: {
  building: Building;
  /** Every floor of every building, so a room can be moved elsewhere. */
  allFloors: Option[];
  initialQuery: string;
  isAdmin: boolean;
  termLabel: string;
  departments: Option[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Only the first floor with rooms starts open, so a phone is not a long scroll.
  const [closed, setClosed] = useState<Set<string>>(() => {
    const first = building.floors.find((f) => f.rooms.length > 0)?.id;
    return new Set(building.floors.filter((f) => f.id !== first).map((f) => f.id));
  });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useShortcut({ keys: "s", description: "Search rooms", group: "Rooms", handler: () => searchRef.current?.focus() });

  const q = query.trim().toLowerCase();
  const filtering = !!q || !!departmentFilter || !!statusFilter;
  const floors = useMemo(() => {
    if (!filtering) return building.floors;
    const designated = (r: Room) =>
      !departmentFilter || departmentFilter === (r.departmentId || (r.isGeneralShared ? GENERAL : UNASSIGNED));
    const match = (r: Room) =>
      designated(r) && (!statusFilter || r.status === statusFilter) && (!q || [r.roomNumber, r.roomName, r.roomType.replace(/_/g, " "), r.equipment].some((v) => v.toLowerCase().includes(q)));
    const named = (name: string) => !departmentFilter && !statusFilter && !!q && name.toLowerCase().includes(q);
    return building.floors.map((f) => ({ ...f, rooms: f.rooms.filter(match) })).filter((f) => f.rooms.length || named(f.name));
  }, [building.floors, q, departmentFilter, statusFilter, filtering]);

  // Room information list for printing and export, following the current search and filter.
  const report = useMemo<ReportDoc<RoomListRow>>(() => {
    const rows = floors.flatMap((f) => f.rooms.map((r) => ({ ...r, location: `${building.name}, ${f.name}`, designation: designation(r) })));
    const filterLabel = departmentFilter === GENERAL ? "General / Shared" : departmentFilter === UNASSIGNED ? "Unassigned" : departments.find((p) => p.value === departmentFilter)?.label;
    return {
      title: `Room Information List: ${building.name}${filterLabel ? `, ${filterLabel}` : ""}`,
      term: termLabel,
      filename: "room-information-list",
      landscape: true,
      rows,
      columns: [
        { header: "Room Number", value: (r) => r.roomNumber },
        { header: "Room Name", value: (r) => r.roomName },
        { header: "Building and Floor", value: (r) => r.location },
        { header: "Capacity", value: (r) => r.capacity },
        { header: "Type", value: (r) => ROOM_TYPES.find((t) => t.value === r.roomType)?.label ?? r.roomType },
        { header: "Department designation", value: (r) => r.designation },
        { header: "Availability", value: (r) => STATUSES.find((t) => t.value === r.status)?.label ?? r.status },
        { header: "Use This Term", value: (r) => `${r.utilization}%` },
      ],
    };
  }, [floors, building.name, departments, departmentFilter, termLabel]);

  // Floors start open; while searching, everything that matched is shown expanded.
  const isOpen = (id: string) => filtering || !closed.has(id);
  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- dialogs -------------------------------------------------------------
  let dialog: { title: string; fields: FormField[]; values: object; submit: (fd: FormData) => Promise<ActionResult> } | null = null;
  if (isAdmin && editor?.kind === "floor") {
    dialog = {
      title: editor.item ? `Edit ${editor.item.name}` : `Add floor to ${building.name}`,
      fields: [
        { name: "buildingId", label: "", type: "hidden" },
        { name: "name", label: "Floor name", type: "text", required: true, placeholder: "Second Floor" },
        { name: "number", label: "Floor number (for ordering)", type: "number", min: -5, max: 100, required: true, help: "1 = ground floor" },
      ],
      values: editor.item ?? { buildingId: building.id, number: (building.floors.at(-1)?.number ?? 0) + 1 },
      submit: (fd) => saveFloorAction(editor.item?.id ?? null, fd),
    };
  } else if (isAdmin && editor?.kind === "room") {
    dialog = {
      title: editor.item ? `Edit ${roomLabel(editor.item)}` : "Add room",
      fields: [
        { name: "roomNumber", label: "Room number", type: "text", required: true, placeholder: "204" },
        { name: "roomName", label: "Room name", type: "text", required: true, placeholder: "Room 204" },
        { name: "floorId", label: "Building & floor", type: "select", required: true, options: allFloors, wide: true },
        { name: "capacity", label: "Seating capacity", type: "number", min: 1, required: true },
        { name: "roomType", label: "Room type", type: "select", required: true, options: ROOM_TYPES },
        { name: "status", label: "Status", type: "select", required: true, options: STATUSES },
        { name: "equipment", label: "Equipment (comma-separated)", type: "text", placeholder: "Projector, Air conditioning, 40 computers", wide: true },
        {
          name: "departmentId",
          label: "Department designation",
          type: "select",
          options: [
            { value: "", label: "General / Shared" },
            { value: UNASSIGNED, label: "Unassigned" },
            ...departments,
            ...(editor.item?.departmentId && !departments.some((d) => d.value === editor.item?.departmentId)
              ? [{ value: editor.item.departmentId, label: editor.item.departmentName }] : []),
          ],
          wide: true,
          help: "This is also the owning department. General / Shared rooms can be used by every department; designated rooms serve their department. Unassigned rooms cannot be scheduled until a designation is chosen.",
        },
      ],
      values: editor.item
        ? { ...editor.item, departmentId: !editor.item.departmentId && !editor.item.isGeneralShared ? UNASSIGNED : editor.item.departmentId }
        : { floorId: editor.floorId, capacity: 40, roomType: "LECTURE_ROOM", status: "AVAILABLE", departmentId: isAdmin ? "" : departments[0]?.value },
      submit: (fd) => saveRoomAction(editor.item?.id ?? null, fd),
    };
  }

  return (
    <div className="space-y-4">
      {!isAdmin && <p className="text-sm text-muted-foreground">View only. Rooms are managed by the Registrar.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search rooms"
            placeholder="Search room number, name, type, equipment…  (s)"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <NativeSelect
          aria-label="Filter by department designation"
          className="w-full sm:w-72"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          placeholder="All departments"
          options={[{ value: GENERAL, label: "General / Shared" }, { value: UNASSIGNED, label: "Unassigned" }, ...departments]}
        />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {isAdmin && (
            <Button variant="outline" onClick={() => setEditor({ kind: "floor", buildingId: building.id })}>
              <Plus className="size-4" /> Add floor
            </Button>
          )}
          <ReportButtons doc={report} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rooms by availability">
        {[{ value: "", label: "All" }, ...STATUSES].map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={statusFilter === s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn("min-h-11 rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9", statusFilter === s.value ? "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15" : "bg-card hover:bg-muted")}
          >
            {s.label}
          </button>
        ))}
      </div>

      {floors.length === 0 ? (
        <EmptyState
          icon={Stack}
          title={building.floors.length ? "No rooms match your search or filter" : "No floors yet"}
          description={building.floors.length ? undefined : "Add a floor, then its rooms."}
          action={building.floors.length || !isAdmin ? undefined : <Button onClick={() => setEditor({ kind: "floor", buildingId: building.id })}>Add floor</Button>}
        />
      ) : (
        <div className="space-y-4">
          {floors.map((f) => (
            <FloorPanel
              key={f.id}
              floor={f}
              expanded={isOpen(f.id)}
              onToggle={() => toggle(f.id)}
              onAddRoom={() => setEditor({ kind: "room", floorId: f.id })}
              onEditFloor={() => setEditor({ kind: "floor", buildingId: building.id, item: f })}
              onDeleteFloor={() => setDeleting({ id: f.id, label: `${building.name} ${f.name}` })}
              onEditRoom={(r) => setEditor({ kind: "room", floorId: f.id, item: r })}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {dialog && (
        <FormDialog
          open={!!editor}
          onOpenChange={(o) => !o && setEditor(null)}
          title={dialog.title}
          fields={dialog.fields}
          values={dialog.values}
          submitLabel="Save"
          successMessage="Saved"
          onSubmit={dialog.submit}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.label ?? ""}?`}
        description="Only empty floors (with no rooms, including archived ones) can be deleted."
        successMessage="Deleted"
        onConfirm={() => deleteFloorAction(deleting!.id)}
      />
    </div>
  );
}

function FloorPanel({
  floor,
  expanded,
  onToggle,
  onAddRoom,
  onEditFloor,
  onDeleteFloor,
  onEditRoom,
  isAdmin,
}: {
  floor: Floor;
  expanded: boolean;
  onToggle: () => void;
  onAddRoom: () => void;
  onEditFloor: () => void;
  onDeleteFloor: () => void;
  onEditRoom: (r: Room) => void;
  isAdmin: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-l-4 border-primary/40 bg-muted/45 px-3 py-2.5 text-foreground">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`flr-${floor.id}`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded text-left text-sm outline-none"
        >
          <CaretDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
          <Stack className="size-4 text-primary/75" />
          <span className="font-semibold">{floor.name}</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border/70">{floor.rooms.length} rooms</span>
        </button>
        {isAdmin && <ActionButton kind="add" onClick={onAddRoom}>Add room</ActionButton>}
        {isAdmin && (
          <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
            <ActionButton kind="edit" onClick={onEditFloor}>
              Rename
            </ActionButton>
            <ActionButton kind="delete" onClick={onDeleteFloor}>
              Delete
            </ActionButton>
          </div>
        )}
      </div>

      {expanded && (
        <div id={`flr-${floor.id}`} className="border-t">
          {floor.rooms.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No rooms</p>
          ) : (
            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {floor.rooms.map((r) => (
                <div
                  key={r.id}
                  onClick={(e) => isAdmin && !(e.target as HTMLElement).closest("button,a") && onEditRoom(r)}
                  className={cn("flex flex-col gap-3 rounded-lg border border-l-4 bg-card p-3", r.status === "AVAILABLE" ? "border-l-emerald-500/55" : r.status === "UNDER_MAINTENANCE" ? "border-l-amber-500/55" : "border-l-slate-400/70", isAdmin && "cursor-pointer hover:border-primary/40")}
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TYPE_TINT[r.roomType] ?? TYPE_TINT.OTHER)}><Door className="size-4" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.roomNumber}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.roomName} · {ROOM_TYPES.find((t) => t.value === r.roomType)?.label ?? r.roomType}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{r.capacity} seats</Badge>
                    {(isAdmin || (!r.departmentId && !r.priorityFaculty)) && <Badge variant={r.departmentId ? "default" : "outline"}>{designation(r)}</Badge>}
                    {r.priorityFaculty && <Badge variant="secondary">Priority: {r.priorityFaculty}</Badge>}
                    {r.status !== "AVAILABLE" && (
                      <Badge variant="outline" className={r.status === "UNDER_MAINTENANCE" ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300"}>
                        {STATUSES.find((s) => s.value === r.status)?.label}
                      </Badge>
                    )}
                  </div>
                  {r.utilization > 0 && (
                    <div className="flex items-center gap-2" title="Use this term">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${r.utilization}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{r.utilization}%</span>
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5">
                    <ActionButton kind="view" nativeButton={false} render={<Link href={`/scheduler?roomId=${r.id}`} />}>
                      Timetable
                    </ActionButton>
                    {isAdmin && (
                      <ActionButton kind="edit" onClick={() => onEditRoom(r)}>
                        Edit
                      </ActionButton>
                    )}
                    {isAdmin && <ArchiveButton kind="ROOM" id={r.id} name={roomLabel(r)} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
