"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwise,
  ArrowUpRight,
  Buildings,
  CheckCircle,
  Clock,
  Door,
  DotsThree,
  ImageSquare,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  PencilSimple,
  Plus,
  SquaresFour,
  Stack,
  Trash,
  UploadSimple,
  Users,
  Wrench,
  X,
} from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ux/form-dialog";
import { DragHandle, SortableList } from "@/components/ux/sortable-list";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { NativeSelect } from "@/components/ux/native-select";
import { ReportButtons } from "@/components/ux/export-buttons";
import { useShortcut } from "@/components/ux/shortcuts";
import { BuildingArt } from "@/components/rooms/building-art";
import { reorderAction } from "@/actions/reorder";
import type { ReportDoc } from "@/lib/export/report";
import { BUILDING_PURPOSES, PURPOSE_LABELS, buildingStatus, hoursText } from "@/lib/rooms/buildings";
import { cn } from "@/lib/utils";
import { deleteBuildingAction } from "./actions";
import { BuildingDialog, PhotoDialog, type BuildingDetails } from "./building-dialogs";

export interface BuildingSummary extends BuildingDetails {
  photo: string | null;
  floors: number;
  rooms: number;
  seats: number;
  /** Status of every room, for the operational badge. */
  roomStatuses: string[];
  /** Room numbers, names, types, and equipment in lower case, for search. */
  roomIndex: { id: string; text: string }[];
}

/** One room in the printed Room Information List. */
export interface RoomReportRow {
  buildingId: string;
  roomNumber: string;
  roomName: string;
  location: string;
  capacity: number;
  type: string;
  designation: string;
  availability: string;
  utilization: number;
}

type View = "grid" | "list";
type Sort = "custom" | "code" | "name" | "rooms" | "seats";
const SORTS: { value: Sort; label: string }[] = [
  { value: "custom", label: "Custom order" },
  { value: "code", label: "Building code" },
  { value: "name", label: "Name" },
  { value: "rooms", label: "Most rooms" },
  { value: "seats", label: "Most seats" },
];

function Stat({ icon, label, value, note }: { icon: ReactNode; label: string; value: ReactNode; note: string }) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight">{value}</span>
            <span className="truncate text-xs text-muted-foreground">{note}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ statuses }: { statuses: string[] }) {
  const s = buildingStatus(statuses);
  return (
    <Badge variant="outline" className={cn("gap-1.5", s.operational ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-200")}>
      <span className={cn("size-1.5 rounded-full", s.operational ? "bg-emerald-500" : "bg-amber-500")} aria-hidden />
      {s.label}
    </Badge>
  );
}

export function BuildingsOverview({
  buildings,
  roomRows,
  isAdmin,
  termLabel,
  loadedAt,
  initialQuery,
}: {
  buildings: BuildingSummary[];
  roomRows: RoomReportRow[];
  isAdmin: boolean;
  termLabel: string;
  loadedAt: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<Sort>("custom");
  const [view, setView] = useState<View>("grid");
  const [editing, setEditing] = useState<{ building?: BuildingDetails } | null>(null);
  const [photoFor, setPhotoFor] = useState<BuildingSummary | null>(null);
  const [deleting, setDeleting] = useState<BuildingSummary | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useShortcut({ keys: "n", description: "Add a building", group: "Rooms", handler: () => isAdmin && setEditing({}) });
  useShortcut({ keys: "s", description: "Search buildings and rooms", group: "Rooms", handler: () => searchRef.current?.focus() });

  const q = query.trim().toLowerCase();
  const filtering = !!q || !!purpose || !!status;
  // Matching rooms per building, so a room number search still finds its building.
  const roomMatches = useMemo(() => new Map(buildings.map((b) => [b.id, q ? b.roomIndex.filter((r) => r.text.includes(q)).length : 0])), [buildings, q]);
  const shown = useMemo(() => {
    const list = buildings.filter((b) => {
      const s = buildingStatus(b.roomStatuses);
      const text = [b.name, b.code, b.location, PURPOSE_LABELS[b.purpose]].join(" ").toLowerCase();
      return (
        (!purpose || b.purpose === purpose) &&
        (!status || (status === "OPERATIONAL") === s.operational) &&
        (!q || text.includes(q) || (roomMatches.get(b.id) ?? 0) > 0)
      );
    });
    const by: Record<Sort, ((a: BuildingSummary, b: BuildingSummary) => number) | null> = {
      custom: null,
      code: (a, b) => (a.code || a.name).localeCompare(b.code || b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      rooms: (a, b) => b.rooms - a.rooms,
      seats: (a, b) => b.seats - a.seats,
    };
    return by[sort] ? [...list].sort(by[sort]!) : list;
  }, [buildings, purpose, status, q, sort, roomMatches]);

  const totals = useMemo(() => {
    const operational = buildings.filter((b) => buildingStatus(b.roomStatuses).operational).length;
    return {
      floors: buildings.reduce((s, b) => s + b.floors, 0),
      rooms: buildings.reduce((s, b) => s + b.rooms, 0),
      seats: buildings.reduce((s, b) => s + b.seats, 0),
      operational,
    };
  }, [buildings]);

  const report = useMemo<ReportDoc<RoomReportRow>>(() => {
    const ids = new Set(shown.map((b) => b.id));
    return {
      title: "Room Information List",
      term: termLabel,
      filename: "room-information-list",
      landscape: true,
      rows: roomRows.filter((r) => ids.has(r.buildingId)),
      columns: [
        { header: "Room Number", value: (r) => r.roomNumber },
        { header: "Room Name", value: (r) => r.roomName },
        { header: "Building and Floor", value: (r) => r.location },
        { header: "Capacity", value: (r) => r.capacity },
        { header: "Type", value: (r) => r.type },
        { header: "Designated Program/Strand", value: (r) => r.designation },
        { header: "Availability", value: (r) => r.availability },
        { header: "Use This Term", value: (r) => `${r.utilization}%` },
      ],
    };
  }, [shown, roomRows, termLabel]);

  const href = (b: BuildingSummary) => `/rooms/${b.id}${q && (roomMatches.get(b.id) ?? 0) > 0 ? `?q=${encodeURIComponent(query.trim())}` : ""}`;
  const menu = (b: BuildingSummary, className?: string) =>
    isAdmin && (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="secondary" aria-label={`More actions for ${b.name}`} className={cn("rounded-full shadow-sm", className)} />}>
          <DotsThree className="size-4" weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing({ building: b })}><PencilSimple /> Edit details</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPhotoFor(b)}><ImageSquare /> {b.photo ? "Change photo" : "Add photo"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(b)}><Trash /> Delete building</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const counts = (b: BuildingSummary) => (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><Door className="size-3.5" aria-hidden /> {b.rooms} rooms</span>
      <span className="flex items-center gap-1"><Stack className="size-3.5" aria-hidden /> {b.floors} floor{b.floors === 1 ? "" : "s"}</span>
      <span className="flex items-center gap-1"><Users className="size-3.5" aria-hidden /> {b.seats.toLocaleString()} seats</span>
    </div>
  );

  const footerNote = (b: BuildingSummary) => {
    const s = buildingStatus(b.roomStatuses);
    if (!s.operational) return <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300"><Wrench className="size-3.5" aria-hidden /> {s.closed} room{s.closed === 1 ? "" : "s"} under maintenance or closed</span>;
    const hours = hoursText(b.openingMin, b.closingMin);
    return <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> {hours ?? "Hours not set"}</span>;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Buildings"
        description="A connected view of every building, floor, and room on campus."
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/import?kind=rooms" />}>
              <UploadSimple className="size-4" /> Import rooms
            </Button>
            {isAdmin && (
              <Button onClick={() => setEditing({})} aria-keyshortcuts="n">
                <Plus className="size-4" /> Add building
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Buildings className="size-5" />} label="Total buildings" value={buildings.length} note={`${totals.floors} floors`} />
        <Stat icon={<Door className="size-5" />} label="Rooms and spaces" value={totals.rooms} note={`${totals.seats.toLocaleString()} seats in all`} />
        <Stat
          icon={<CheckCircle className="size-5" />}
          label="Fully operational"
          value={`${totals.operational} of ${buildings.length}`}
          note={totals.operational === buildings.length ? "Every room open" : `${buildings.length - totals.operational} with rooms under maintenance`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-md sm:flex-1">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchRef} type="search" aria-label="Search buildings and rooms" placeholder="Search buildings by name, code, location, or room…  (s)" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <NativeSelect aria-label="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="All purposes" options={BUILDING_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))} className="w-full sm:w-52" />
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={[{ value: "OPERATIONAL", label: "Operational" }, { value: "MAINTENANCE", label: "Maintenance" }]} className="w-full sm:w-40" />
        <div className="flex rounded-md border p-0.5" role="radiogroup" aria-label="Layout">
          {([["grid", SquaresFour, "Card grid"], ["list", ListBullets, "List"]] as const).map(([v, Icon, label]) => (
            <button key={v} role="radio" aria-checked={view === v} aria-label={label} title={label} onClick={() => setView(v)} className={cn("rounded p-1.5", view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        <div className="sm:ml-auto">
          <ReportButtons doc={report} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          {filtering ? "Matching buildings" : "All buildings"} <Badge variant="secondary">{shown.length}</Badge>
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Sort by
          <NativeSelect aria-label="Sort buildings" value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={SORTS} className="w-40" />
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Buildings}
          title={buildings.length ? "No buildings match your search or filters" : "No buildings yet"}
          description={buildings.length ? undefined : "Add a building, then its floors and rooms."}
          action={buildings.length || !isAdmin ? undefined : <Button onClick={() => setEditing({})}>Add building</Button>}
        />
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((b) => (
            <Card key={b.id} className="group gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
              <div className="relative aspect-[16/8] overflow-hidden bg-muted">
                <Link href={href(b)} tabIndex={-1} aria-hidden className="block h-full">
                  <BuildingArt name={b.name} purpose={b.purpose} floors={b.floors} photo={b.photo} className="transition-transform duration-300 group-hover:scale-[1.03]" />
                </Link>
                {b.code && <span className="absolute top-2.5 left-2.5 rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-primary uppercase shadow-sm">Building {b.code}</span>}
                {menu(b, "absolute top-2 right-2")}
              </div>
              <CardContent className="space-y-3 p-4">
                <div>
                  <Link href={href(b)} className="text-lg font-semibold text-primary hover:underline">{b.name}</Link>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" aria-hidden /> {b.location || "Location not set"}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{PURPOSE_LABELS[b.purpose]}</Badge>
                  <StatusBadge statuses={b.roomStatuses} />
                  {(roomMatches.get(b.id) ?? 0) > 0 && <Badge variant="outline">{roomMatches.get(b.id)} matching room{roomMatches.get(b.id) === 1 ? "" : "s"}</Badge>}
                </div>
                {counts(b)}
                <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  {footerNote(b)}
                  <Link href={href(b)} aria-label={`Open ${b.name}`} className="rounded p-1 text-primary hover:bg-primary/10"><ArrowUpRight className="size-4" /></Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><span className="sr-only">Reorder</span></TableHead>
                <TableHead>Building</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rooms</TableHead>
                <TableHead className="text-right">Floors</TableHead>
                <TableHead className="text-right">Seats</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <SortableList
              items={shown}
              disabled={!isAdmin || filtering || sort !== "custom"}
              getLabel={(b) => b.name}
              onReorder={(ids) => reorderAction("building", ids)}
              renderItem={(b, { setNodeRef, style, isDragging, handleProps }) => (
                <TableRow ref={setNodeRef} style={style} className={cn(isDragging && "bg-card shadow-lg")}>
                  <TableCell>{isAdmin && !filtering && sort === "custom" && <DragHandle {...handleProps} />}</TableCell>
                  <TableCell>
                    <Link href={href(b)} className="flex items-center gap-3">
                      <span className="block h-10 w-16 shrink-0 overflow-hidden rounded-md bg-muted"><BuildingArt name={b.name} purpose={b.purpose} floors={b.floors} photo={b.photo} /></span>
                      <span>
                        <span className="block font-medium text-primary hover:underline">{b.name}</span>
                        {b.code && <span className="text-xs text-muted-foreground">Building {b.code}</span>}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.location || "Not set"}</TableCell>
                  <TableCell><Badge variant="secondary">{PURPOSE_LABELS[b.purpose]}</Badge></TableCell>
                  <TableCell><StatusBadge statuses={b.roomStatuses} /></TableCell>
                  <TableCell className="text-right">{b.rooms}</TableCell>
                  <TableCell className="text-right">{b.floors}</TableCell>
                  <TableCell className="text-right">{b.seats.toLocaleString()}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{hoursText(b.openingMin, b.closingMin) ?? "Not set"}</TableCell>
                  <TableCell className="text-right">{menu(b)}</TableCell>
                </TableRow>
              )}
            >
              {(rendered) => <TableBody>{rendered}</TableBody>}
            </SortableList>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{shown.length === buildings.length ? `Showing all ${buildings.length} buildings` : `Showing ${shown.length} of ${buildings.length} buildings`}</span>
        <button onClick={() => router.refresh()} className="flex items-center gap-1 hover:text-foreground">
          <ArrowsClockwise className="size-3.5" aria-hidden /> Last updated {loadedAt}
        </button>
      </div>

      <BuildingDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} building={editing?.building} />
      {photoFor && <PhotoDialog open building={photoFor} hasPhoto={!!photoFor.photo} onOpenChange={(o) => !o && setPhotoFor(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "building"}?`}
        description="Only empty buildings (with no rooms, including archived ones) can be deleted."
        successMessage="Building deleted"
        onConfirm={() => deleteBuildingAction(deleting!.id)}
      />
    </div>
  );
}
