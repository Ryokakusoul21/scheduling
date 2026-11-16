"use client";

import { BookOpen, Lock, Plus } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ux/action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDialogState, type FormField } from "@/components/ux/form-dialog";
import { SubjectFormDialog } from "./subject-form-dialog";
import { termLabel } from "@/lib/academics/levels";
import type { SubjectCalendar } from "@/lib/subjects/terms";
import { ArchiveButton } from "@/components/ux/archive-button";
import { EmptyState } from "@/components/ux/states";
import { CollectionView } from "@/components/ux/collection-view";
import { useShortcut } from "@/components/ux/shortcuts";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { LEVELS, YEAR_LEVELS, gradeLabel, yearLabel, type AcademicLevel } from "@/lib/academics/levels";
import { cn } from "@/lib/utils";
import { saveSubjectAction } from "./actions";

export interface SubjectRow {
  id: string;
  code: string;
  name: string;
  description: string;
  units: number;
  lectureHours: number;
  labHours: number;
  semester: string | null;
  requiredRoomType: string;
  level: string;
  programId: string;
  strand: string | null;
  yearLevel: string;
  gradeLevel: string;
  classes: number;
  editable: boolean;
}

const ROOM_TYPES = [
  { value: "LECTURE_ROOM", label: "Lecture room / classroom" },
  { value: "COMPUTER_LABORATORY", label: "Computer laboratory" },
  { value: "SCIENCE_LABORATORY", label: "Science laboratory" },
  { value: "CONFERENCE_ROOM", label: "Conference room" },
  { value: "OTHER", label: "Other" },
];

const semesterLabel = (semester: string | null) => semester ? termLabel(semester) : "Any configured semester";

export function SubjectsList({
  heading,
  context,
  subjects,
  showStrand,
  strands,
  calendar,
  defaultSemester,
}: {
  heading: string;
  context: { level: string; programId: string; yearLevel: string; gradeLevel: string };
  subjects: SubjectRow[];
  showStrand: boolean;
  strands: { value: string; label: string }[];
  calendar: SubjectCalendar | null;
  defaultSemester?: string;
}) {
  const dialog = useDialogState<SubjectRow>();
  const { ref, onKeyDown, onFocus } = useRovingFocus<HTMLTableSectionElement>();
  const level = context.level as AcademicLevel;
  const isCollege = level === "COLLEGE";

  useShortcut({ keys: "n", description: "Add a subject", group: "Subjects", handler: dialog.openCreate });

  const editing = dialog.state?.mode === "edit" ? dialog.state.item : null;

  const fields: FormField[] = [
    { name: "level", label: "", type: "hidden" },
    ...(isCollege || level === "JUNIOR_HIGH" || level === "ELEMENTARY" ? [{ name: "programId", label: "", type: "hidden" as const }] : []),
    { name: "code", label: "Subject code", type: "text", required: true, placeholder: isCollege ? "IT101" : "MATH7" },
    { name: "name", label: "Subject name", type: "text", required: true },
    { name: "units", label: isCollege ? "Units" : "Units / credit", type: "number", step: "0.5", min: 0, required: true },
    { name: "hoursPerWeek", label: "Hours per week", type: "number", step: "0.5", min: 0.5, required: true },
    { name: "requiredRoomType", label: "Room needed", type: "select", required: true, options: ROOM_TYPES },
    isCollege
      ? {
          name: "yearLevel",
          label: "Year level",
          type: "select",
          options: [{ value: "", label: "Any year" }, ...YEAR_LEVELS.slice(0, 4).map((y) => ({ value: y, label: yearLabel(y) }))],
        }
      : {
          name: "gradeLevel",
          label: "Grade level",
          type: "select",
          required: true,
          options: LEVELS[level].grades.map((g) => ({ value: g, label: gradeLabel(g) })),
        },
    ...(isCollege
      ? [{
          name: "semester",
          label: "Semester",
          type: "select" as const,
        }]
      : []),
    ...(level === "SENIOR_HIGH"
      ? [{ name: "programId", label: "Strand", type: "select" as const, options: [{ value: "", label: "Core — all strands" }, ...strands] }]
      : []),
    { name: "description", label: "Description", type: "textarea", wide: true },
  ];

  const totalUnits = subjects.reduce((s, x) => s + x.units, 0);
  const totalHours = subjects.reduce((s, x) => s + x.lectureHours + x.labHours, 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div>
          <h2 className="font-semibold">{heading}</h2>
          <p className="text-xs text-muted-foreground">
            {subjects.length} subjects · {totalUnits} units · {totalHours} hours/week
          </p>
        </div>
        <Button onClick={dialog.openCreate} aria-keyshortcuts="n">
          <Plus className="size-4" /> Add subject
        </Button>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects here yet"
          description="Add the subjects taught at this level, with units and weekly hours."
          action={<Button onClick={dialog.openCreate}>Add subject</Button>}
          className="m-4"
        />
      ) : (
        <CollectionView storageKey="subjects:basic-view" label="Subjects" defaultView="table" table={
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Subject</TableHead>
                {isCollege && <TableHead>Semester</TableHead>}
                {showStrand && <TableHead>Strand</TableHead>}
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Hours per week</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody ref={ref} onKeyDown={onKeyDown} onFocus={onFocus}>
              {subjects.map((s) => (
                <TableRow
                  key={s.id}
                  data-roving=""
                  tabIndex={-1}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button") || !s.editable) return;
                    dialog.openEdit(s);
                  }}
                  aria-label={`${s.code} ${s.name}, ${s.units} units.${s.editable ? " Press Enter to edit." : ""}`}
                  className={s.editable ? "cursor-pointer" : "bg-muted/40"}
                >
                  <TableCell className="font-medium">{s.code}</TableCell>
                  <TableCell>
                    {s.name}
                    {s.classes > 0 && <span className="block text-xs text-muted-foreground">{s.classes} scheduled classes</span>}
                  </TableCell>
                  {isCollege && (
                    <TableCell>
                      <Badge variant="outline">{semesterLabel(s.semester)}</Badge>
                    </TableCell>
                  )}
                  {showStrand && <TableCell>{s.strand ? <Badge variant="secondary">{s.strand}</Badge> : <span className="text-xs text-muted-foreground">Core</span>}</TableCell>}
                  <TableCell className="text-right">{s.units}</TableCell>
                  <TableCell className="text-right">
                    {s.lectureHours + s.labHours}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROOM_TYPES.find((r) => r.value === s.requiredRoomType)?.label ?? s.requiredRoomType}</Badge>
                  </TableCell>
                  <TableCell>
                    {s.editable ? (
                      <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
                        <ActionButton kind="edit" onClick={() => dialog.openEdit(s)}>
                          Edit
                        </ActionButton>
                        <ArchiveButton kind="SUBJECT" id={s.id} name={s.code} />
                      </div>
                    ) : (
                      <span className="flex items-center justify-end gap-1 text-sm text-muted-foreground"><Lock className="size-3.5" aria-hidden /> Read-only</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        }>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {subjects.map((s) => (
              <div key={s.id} className={cn("rounded-xl border bg-card p-4 shadow-xs", !s.editable && "bg-muted/40")}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" disabled={!s.editable} onClick={() => dialog.openEdit(s)} className="min-w-0 text-left">
                    <p className="font-semibold">{s.code}</p>
                    <p className="truncate text-sm text-muted-foreground">{s.name}</p>
                  </button>
                  {s.editable ? <div className="flex shrink-0 gap-1.5"><ActionButton kind="edit" onClick={() => dialog.openEdit(s)}>Edit</ActionButton><ArchiveButton kind="SUBJECT" id={s.id} name={s.code} /></div> : <Badge variant="outline"><Lock className="mr-1 size-3" /> Read-only</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {showStrand && <Badge variant="secondary">{s.strand ?? "Core"}</Badge>}
                  {isCollege && <Badge variant="outline">{semesterLabel(s.semester)}</Badge>}
                  <Badge variant="outline">{s.units} units</Badge>
                  <Badge variant="outline">{s.lectureHours + s.labHours} hours per week</Badge>
                  <Badge variant="outline">{ROOM_TYPES.find((r) => r.value === s.requiredRoomType)?.label ?? s.requiredRoomType}</Badge>
                </div>
                {s.classes > 0 && <p className="mt-2 text-xs text-muted-foreground">{s.classes} scheduled classes</p>}
              </div>
            ))}
          </div>
        </CollectionView>
      )}

      <SubjectFormDialog
        key={`${editing?.id ?? "new"}:${calendar?.id ?? ""}:${!!dialog.state}`}
        calendar={calendar}
        editing={!!editing}
        open={!!dialog.state}
        onOpenChange={(o) => !o && dialog.close()}
        title={editing ? `Edit ${editing.code}` : "Add subject"}
        description={heading}
        fields={fields}
        values={editing ? { ...editing, semester: editing.semester ?? "", hoursPerWeek: editing.lectureHours + editing.labHours } : { ...context, semester: defaultSemester, units: isCollege ? 3 : 1, hoursPerWeek: isCollege ? 3 : 4, requiredRoomType: "LECTURE_ROOM" }}
        submitLabel={editing ? "Save changes" : "Add subject"}
        successMessage={editing ? "Subject updated" : "Subject added"}
        onSubmit={(fd) => saveSubjectAction(editing?.id ?? null, fd)}
      />
    </Card>
  );
}
