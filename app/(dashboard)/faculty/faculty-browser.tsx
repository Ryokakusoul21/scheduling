"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MagnifyingGlass, Plus, Rows, SquaresFour, UserSquare, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ux/action-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { ArchiveButton } from "@/components/ux/archive-button";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState, PageHeader } from "@/components/ux/states";
import { useShortcut } from "@/components/ux/shortcuts";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { ACADEMIC_LEVELS, LEVELS, levelLabel } from "@/lib/academics/levels";
import { cn } from "@/lib/utils";
import { LoadBar, LoadStatusLabel } from "@/components/workload/load-bar";
import { createFacultyAction, updateFacultyAction } from "./actions";

export interface FacultyRow {
  id: string;
  employeeId: string;
  fullName: string;
  image: string | null;
  email: string;
  position: string;
  specialization: string;
  departmentId: string;
  department: string | null;
  maxHours: number;
  employmentType: "FULL_TIME" | "PART_TIME";
  dayOff: string;
  status: string;
  teachingLevels: string[];
  /** Workload engine row for active faculty (null for inactive ones). */
  load: { load: number; minimum: number; maximum: number; status: "UNDERLOADED" | "BALANCED" | "OVERLOADED" } | null;
  loadUnit: string;
  classes: number;
}

const STATUS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "INACTIVE", label: "Inactive" },
];

export function FacultyBrowser({
  faculty,
  departments,
  initialQuery,
}: {
  faculty: FacultyRow[];
  departments: { value: string; label: string }[];
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [level, setLevel] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const searchRef = useRef<HTMLInputElement>(null);
  const dialog = useDialogState<FacultyRow>();
  const { ref: gridRef, onKeyDown: onGridKeyDown, onFocus: onGridFocus } = useRovingFocus({ orientation: "grid" });
  const { ref: rowsRef, onKeyDown: onRowsKeyDown, onFocus: onRowsFocus } = useRovingFocus<HTMLTableSectionElement>();

  useShortcut({ keys: "n", description: "Add faculty member", group: "Faculty", handler: dialog.openCreate });
  useShortcut({ keys: "s", description: "Search faculty", group: "Faculty", handler: () => searchRef.current?.focus() });
  useShortcut({ keys: "t", description: "Switch cards / table", group: "Faculty", handler: () => setView((v) => (v === "cards" ? "table" : "cards")) });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faculty.filter(
      (f) =>
        (!q || [f.fullName, f.employeeId, f.email, f.specialization, f.position].some((v) => v.toLowerCase().includes(q))) &&
        (!level || f.teachingLevels.includes(level)) &&
        (!department || f.departmentId === department) &&
        (!status || f.status === status)
    );
  }, [faculty, query, level, department, status]);

  const editing = dialog.state?.mode === "edit" ? dialog.state.item : null;
  const filtersOn = !!(query || level || department || status);

  const fields: FormField[] = [
    { name: "employeeId", label: "Employee ID", type: "text", required: true, placeholder: "F-019" },
    { name: "fullName", label: "Full name", type: "text", required: true, placeholder: "Juan Dela Cruz" },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "departmentId", label: "Department", type: "select", options: [{ value: "", label: "No department" }, ...departments] },
    { name: "position", label: "Position", type: "text", placeholder: "Instructor I" },
    { name: "specialization", label: "Specialization", type: "text", placeholder: "Mathematics" },
    { name: "maxHours", label: "Maximum teaching hours per week", type: "number", min: 1, max: 80, required: true },
    { name: "employmentType", label: "Employment type", type: "select", required: true, options: [{ value: "FULL_TIME", label: "Full-time (8 hours a day, every day)" }, { value: "PART_TIME", label: "Part-time (8 hours a day, one day off)" }] },
    { name: "dayOff", label: "Day off (part-time only)", type: "select", options: [{ value: "", label: "None" }, ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map((d) => ({ value: d, label: d[0] + d.slice(1).toLowerCase() }))] },
    { name: "status", label: "Status", type: "select", required: true, options: STATUS },
    {
      name: "teachingLevels",
      label: "Teaches at",
      type: "checkboxes",
      wide: true,
      options: ACADEMIC_LEVELS.map((l) => ({ value: l, label: LEVELS[l].label })),
      help: "Used to suggest teachers in the Scheduler.",
    },
  ];

  const menu = (f: FacultyRow) => (
    <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
      <ActionButton kind="edit" onClick={() => dialog.openEdit(f)}>
        Edit
      </ActionButton>
      <ActionButton kind="view" nativeButton={false} render={<Link href={`/scheduler?facultyId=${f.id}`} />}>
        Timetable
      </ActionButton>
      <ArchiveButton kind="FACULTY" id={f.id} name={f.fullName} />
    </div>
  );

  // Live status colors: red overloaded, amber near limit, green balanced, blue underloaded.
  const loadBar = (f: FacultyRow) => f.load && (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Load this term</span>
        <span className="tabular-nums">{f.load.load} of {f.load.maximum} {f.loadUnit}</span>
      </div>
      <LoadBar r={f.load} className="mt-1 h-1.5" />
      <div className="mt-1"><LoadStatusLabel status={f.load.status} r={f.load} /></div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Faculty"
        description={`${faculty.length} faculty members across all levels`}
        actions={
          <Button onClick={dialog.openCreate} aria-keyshortcuts="n">
            <Plus className="size-4" /> Add faculty
          </Button>
        }
      />

      <Card className="flex-row flex-wrap items-center gap-3 p-3">
        <div className="relative w-full min-w-0 flex-1 sm:min-w-56">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search faculty"
            placeholder="Search name, ID, email, specialization…  (s)"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <NativeSelect aria-label="Filter by level" className="w-44" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="All levels" options={ACADEMIC_LEVELS.map((l) => ({ value: l, label: levelLabel(l) }))} />
        <NativeSelect aria-label="Filter by department" className="w-52" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="All departments" options={departments} />
        <NativeSelect aria-label="Filter by status" className="w-36" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Any status" options={STATUS} />
        {filtersOn && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setLevel("");
              setDepartment("");
              setStatus("");
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
        <div role="radiogroup" aria-label="View" className="ml-auto inline-flex rounded-lg border p-0.5">
          {(
            [
              ["cards", SquaresFour, "Cards"],
              ["table", Rows, "Table"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </Card>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {filtered.length} of {faculty.length}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserSquare}
          title={faculty.length ? "No faculty match these filters" : "No faculty yet"}
          action={faculty.length ? undefined : <Button onClick={dialog.openCreate}>Add faculty</Button>}
        />
      ) : view === "cards" ? (
        <div ref={gridRef} onKeyDown={onGridKeyDown} onFocus={onGridFocus} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((f) => (
            <div key={f.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
              <div className="flex items-start gap-3">
                <UserAvatar name={f.fullName} image={f.image} className="size-11" />
                <button
                  type="button"
                  data-roving=""
                  tabIndex={-1}
                  onClick={() => dialog.openEdit(f)}
                  className="min-w-0 flex-1 rounded text-left outline-none"
                  aria-label={`${f.fullName}, ${f.position || "faculty"}. Press Enter to edit.`}
                >
                  <p className="truncate font-semibold">{f.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.position || f.employeeId}</p>
                  {f.department && <p className="truncate text-xs text-muted-foreground" title={f.department}>{f.department}</p>}
                  {f.specialization && <p className="truncate text-xs text-muted-foreground" title={f.specialization}>{f.specialization}</p>}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {f.status !== "ACTIVE" && <Badge variant="destructive">{STATUS.find((s) => s.value === f.status)?.label}</Badge>}
                {f.teachingLevels.map((l) => (
                  <Badge key={l} variant="secondary">
                    {LEVELS[l as keyof typeof LEVELS]?.short ?? l}
                  </Badge>
                ))}
              </div>
              {loadBar(f)}
              <div className="mt-auto border-t pt-3">{menu(f)}</div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Levels</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">Load</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody ref={rowsRef} onKeyDown={onRowsKeyDown} onFocus={onRowsFocus}>
              {filtered.map((f) => (
                <TableRow
                  key={f.id}
                  data-roving=""
                  tabIndex={-1}
                  className="cursor-pointer"
                  onClick={(e) => !(e.target as HTMLElement).closest("button") && dialog.openEdit(f)}
                  aria-label={`${f.fullName}. Press Enter to edit.`}
                >
                  <TableCell className="font-medium">{f.fullName}</TableCell>
                  <TableCell>{f.employeeId}</TableCell>
                  <TableCell>{f.department ?? "—"}</TableCell>
                  <TableCell className="space-x-1">
                    {f.teachingLevels.map((l) => (
                      <Badge key={l} variant="secondary">
                        {LEVELS[l as keyof typeof LEVELS]?.short ?? l}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.status === "ACTIVE" ? "default" : "destructive"}>{STATUS.find((s) => s.value === f.status)?.label}</Badge>
                  </TableCell>
                  <TableCell>{loadBar(f)}</TableCell>
                  <TableCell>{menu(f)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <FormDialog
        open={!!dialog.state}
        onOpenChange={(o) => !o && dialog.close()}
        title={editing ? `Edit ${editing.fullName}` : "Add faculty member"}
        fields={fields}
        values={editing ?? { maxHours: 24, employmentType: "FULL_TIME", dayOff: "", status: "ACTIVE", teachingLevels: level ? [level] : ["COLLEGE"] }}
        submitLabel={editing ? "Save changes" : "Add faculty"}
        successMessage={editing ? "Faculty updated" : "Faculty added"}
        onSubmit={(fd) => (editing ? updateFacultyAction(editing.id, fd) : createFacultyAction(fd))}
      />
    </div>
  );
}
