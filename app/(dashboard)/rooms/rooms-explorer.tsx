"use client";

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog, FormDialog, type ActionResult, type FormField } from "@/components/ux/form-dialog";
import { ArchiveButton } from "@/components/ux/archive-button";
import { DragHandle, SortableList } from "@/components/ux/sortable-list";
import { EmptyState } from "@/components/ux/states";
import { NativeSelect } from "@/components/ux/native-select";
import { ReportButtons } from "@/components/ux/export-buttons";
import type { ReportDoc } from "@/lib/export/report";
import { useShortcut } from "@/components/ux/shortcuts";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { reorderAction } from "@/actions/reorder";
import { cn } from "@/lib/utils";
import { designation, GENERAL, ROOM_TYPES, STATUSES, type Building, type Floor, type Option, type Room } from "@/lib/rooms/rooms";
import {
  deleteFloorAction,
  saveFloorAction,
  saveRoomAction,
} from "./actions";

type Editor =
  | { kind: "floor"; buildingId: string; item?: Floor }
  | { kind: "room"; floorId: string; item?: Room };

type Deleting = { id: string; label: string };

type RoomListRow = Room & { location: string; designation: string };

/** Floors and rooms of one building: search, program filter, floor and room editing, and the room information list. */
export function RoomsExplorer({
  building,
  allFloors,
  initialQuery,
  isAdmin,
  termLabel,
  departments,
  programs,
}: {
  building: Building;
  /** Every floor of every building, so a room can be moved elsewhere. */
  allFloors: Option[];
  initialQuery: string;
  isAdmin: boolean;
  termLabel: string;
  departments: Option[];
  programs: Option[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [programFilter, setProgramFilter] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useShortcut({ keys: "s", description: "Search rooms", group: "Rooms", handler: () => searchRef.current?.focus() });

  const q = query.trim().toLowerCase();
  const filtering = !!q || !!programFilter;
  const floors = useMemo(() => {
    if (!filtering) return building.floors;
    const designated = (r: Room) =>
      !programFilter || (programFilter === GENERAL ? r.programIds.length === 0 : r.programIds.includes(programFilter));
    const match = (r: Room) =>
      designated(r) && (!q || [r.roomNumber, r.roomName, r.roomType.replace(/_/g, " "), r.equipment].some((v) => v.toLowerCase().includes(q)));
    const named = (name: string) => !programFilter && !!q && name.toLowerCase().includes(q);
    return building.floors.map((f) => ({ ...f, rooms: f.rooms.filter(match) })).filter((f) => f.rooms.length || named(f.name));
  }, [building.floors, q, programFilter, filtering]);

  // Room information list for printing and export, following the current search and filter.
  const report = useMemo<ReportDoc<RoomListRow>>(() => {
    const rows = floors.flatMap((f) => f.rooms.map((r) => ({ ...r, location: `${building.name}, ${f.name}`, designation: designation(r, programs) })));
    const filterLabel = programFilter === GENERAL ? "General / Shared" : programs.find((p) => p.value === programFilter)?.label;
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
        { header: "Designated Program/Strand", value: (r) => r.designation },
        { header: "Availability", value: (r) => STATUSES.find((t) => t.value === r.status)?.label ?? r.status },
        { header: "Use This Term", value: (r) => `${r.utilization}%` },
      ],
    };
  }, [floors, building.name, programs, programFilter, termLabel]);

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
  if (editor?.kind === "floor") {
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
  } else if (editor?.kind === "room") {
    dialog = {
      title: editor.item ? `Edit ${editor.item.roomName}` : "Add room",
      fields: [
        { name: "roomNumber", label: "Room number", type: "text", required: true, placeholder: "204" },
        { name: "roomName", label: "Room name", type: "text", required: true, placeholder: "Room 204" },
        { name: "floorId", label: "Building & floor", type: "select", required: true, options: allFloors, wide: true },
        { name: "capacity", label: "Seating capacity", type: "number", min: 1, required: true },
        { name: "roomType", label: "Room type", type: "select", required: true, options: ROOM_TYPES },
        { name: "status", label: "Status", type: "select", required: true, options: STATUSES },
        { name: "equipment", label: "Equipment (comma-separated)", type: "text", placeholder: "Projector, Air conditioning, 40 computers", wide: true },
        {
          name: "programIds",
          label: "Designated Program/Strand",
          type: "checkboxes",
          options: [{ value: GENERAL, label: "General / Shared" }, ...programs.map((p) => ({ ...p, label: p.label.split(" - ")[0] }))],
          wide: true,
          help: "Sections are only placed here if the room is designated for their program or strand, or is General / Shared. Leave everything unticked for General / Shared.",
        },
        {
          name: "departmentId",
          label: "Owning department",
          type: "select",
          options: isAdmin ? [{ value: "", label: "Shared room (Administrator)" }, ...departments] : departments,
          wide: true,
          help: "The Head of Department of the owning department can manage and close this room.",
        },
      ],
      values: editor.item
        ? { ...editor.item, programIds: editor.item.programIds.length ? editor.item.programIds : [GENERAL] }
        : { programIds: [GENERAL], floorId: editor.floorId, capacity: 40, roomType: "LECTURE_ROOM", status: "AVAILABLE", departmentId: isAdmin ? "" : departments[0]?.value },
      submit: (fd) => saveRoomAction(editor.item?.id ?? null, fd),
    };
  }

  return (
    <div className="space-y-4">
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
          aria-label="Filter by designated program or strand"
          className="w-full sm:w-72"
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          placeholder="All programs and strands"
          options={[{ value: GENERAL, label: "General / Shared" }, ...programs]}
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

      {floors.length === 0 ? (
        <EmptyState
          icon={Stack}
          title={building.floors.length ? "No rooms match your search or filter" : "No floors yet"}
          description={building.floors.length ? undefined : "Add a floor, then its rooms."}
          action={building.floors.length || !isAdmin ? undefined : <Button onClick={() => setEditor({ kind: "floor", buildingId: building.id })}>Add floor</Button>}
        />
      ) : (
        <div className="space-y-3">
          {floors.map((f) => (
            <FloorPanel
              key={f.id}
              floor={f}
              expanded={isOpen(f.id)}
              searching={filtering}
              programs={programs}
              onToggle={() => toggle(f.id)}
              onAddRoom={() => setEditor({ kind: "room", floorId: f.id })}
              onEditFloor={() => setEditor({ kind: "floor", buildingId: building.id, item: f })}
              onDeleteFloor={() => setDeleting({ id: f.id, label: `${building.name} ${f.name}` })}
              onEditRoom={(r) => setEditor({ kind: "room", floorId: f.id, item: r })}
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
  searching,
  onToggle,
  onAddRoom,
  onEditFloor,
  onDeleteFloor,
  onEditRoom,
  programs,
}: {
  floor: Floor;
  programs: Option[];
  expanded: boolean;
  searching: boolean;
  onToggle: () => void;
  onAddRoom: () => void;
  onEditFloor: () => void;
  onDeleteFloor: () => void;
  onEditRoom: (r: Room) => void;
}) {
  const { ref, onKeyDown, onFocus } = useRovingFocus<HTMLTableSectionElement>();
  return (
    <div className="rounded-lg border bg-background/50">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`flr-${floor.id}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-sm outline-none"
        >
          <CaretDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
          <Stack className="size-4 text-muted-foreground" />
          <span className="font-medium">{floor.name}</span>
          <Badge variant="secondary">{floor.rooms.length} rooms</Badge>
        </button>
        <ActionButton kind="add" onClick={onAddRoom}>Add room</ActionButton>
        <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
          <ActionButton kind="edit" onClick={onEditFloor}>
            Rename
          </ActionButton>
          <ActionButton kind="delete" onClick={onDeleteFloor}>
            Delete
          </ActionButton>
        </div>
      </div>

      {expanded && (
        <div id={`flr-${floor.id}`} className="overflow-x-auto border-t">
          {floor.rooms.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No rooms on this floor yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Reorder</span>
                  </TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead>Designated Program/Strand</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40">Use this term</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <SortableList
                items={floor.rooms}
                disabled={searching}
                getLabel={(r) => r.roomName}
                onReorder={(ids) => reorderAction("room", ids)}
                renderItem={(r, { setNodeRef, style, isDragging, handleProps }) => (
                  <TableRow
                    ref={setNodeRef}
                    style={style}
                    data-roving=""
                    tabIndex={-1}
                    onClick={(e) => !(e.target as HTMLElement).closest("button,a") && onEditRoom(r)}
                    aria-label={`${r.roomName}, ${r.capacity} seats, ${r.status.replace(/_/g, " ").toLowerCase()}. Press Enter to edit.`}
                    className={cn("cursor-pointer", isDragging && "bg-card shadow-lg")}
                  >
                    <TableCell>{!searching && <DragHandle {...handleProps} />}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Door className="size-4 text-muted-foreground" />
                        <span>
                          <span className="font-medium">{r.roomName}</span>
                          <span className="block text-xs text-muted-foreground">
                            #{r.roomNumber}
                            {r.equipment && ` · ${r.equipment}`}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROOM_TYPES.find((t) => t.value === r.roomType)?.label ?? r.roomType}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.capacity}</TableCell>
                    <TableCell>
                      <Badge variant={r.programIds.length ? "default" : "secondary"}>{designation(r, programs)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "AVAILABLE" ? "secondary" : "destructive"}>{STATUSES.find((s) => s.value === r.status)?.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${r.utilization}%` }} />
                        </div>
                        <span className="w-9 text-right text-xs text-muted-foreground">{r.utilization}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
                        <ActionButton kind="edit" onClick={() => onEditRoom(r)}>
                          Edit
                        </ActionButton>
                        <ActionButton kind="view" nativeButton={false} render={<Link href={`/scheduler?roomId=${r.id}`} />}>
                          Timetable
                        </ActionButton>
                        <ArchiveButton kind="ROOM" id={r.id} name={r.roomName} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              >
                {(rows) => (
                  <TableBody ref={ref} onKeyDown={onKeyDown} onFocus={onFocus}>
                    {rows}
                  </TableBody>
                )}
              </SortableList>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
