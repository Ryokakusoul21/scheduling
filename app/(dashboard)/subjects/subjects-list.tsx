"use client";

import { BookOpen, DotsThree, PencilSimple, Plus, Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, FormDialog, useDialogState, type FormField } from "@/components/ux/form-dialog";
import { DragHandle, SortableList } from "@/components/ux/sortable-list";
import { EmptyState } from "@/components/ux/states";
import { useShortcut } from "@/components/ux/shortcuts";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { reorderAction } from "@/actions/reorder";
import { LEVELS, YEAR_LEVELS, gradeLabel, yearLabel, type AcademicLevel } from "@/lib/academics/levels";
import { cn } from "@/lib/utils";
import { deleteSubjectAction, saveSubjectAction } from "./actions";

export interface SubjectRow {
  id: string;
  code: string;
  name: string;
  description: string;
  units: number;
  lectureHours: number;
  labHours: number;
  requiredRoomType: string;
  level: string;
  programId: string;
  strand: string | null;
  yearLevel: string;
  gradeLevel: string;
  classes: number;
}

const ROOM_TYPES = [
  { value: "LECTURE_ROOM", label: "Lecture room / classroom" },
  { value: "COMPUTER_LABORATORY", label: "Computer laboratory" },
  { value: "SCIENCE_LABORATORY", label: "Science laboratory" },
  { value: "CONFERENCE_ROOM", label: "Conference room" },
  { value: "OTHER", label: "Other" },
];

export function SubjectsList({
  heading,
  context,
  subjects,
  showStrand,
  strands,
}: {
  heading: string;
  context: { level: string; programId: string; yearLevel: string; gradeLevel: string };
  subjects: SubjectRow[];
  showStrand: boolean;
  strands: { value: string; label: string }[];
}) {
  const dialog = useDialogState<SubjectRow>();
  const del = useDialogState<SubjectRow>();
  const { ref, onKeyDown, onFocus } = useRovingFocus<HTMLTableSectionElement>();
  const level = context.level as AcademicLevel;
  const isCollege = level === "COLLEGE";

  useShortcut({ keys: "n", description: "Add a subject", group: "Subjects", handler: dialog.openCreate });

  const editing = dialog.state?.mode === "edit" ? dialog.state.item : null;
  const deleting = del.state?.mode === "edit" ? del.state.item : null;

  const fields: FormField[] = [
    { name: "level", label: "", type: "hidden" },
    ...(isCollege || level === "JUNIOR_HIGH" || level === "ELEMENTARY" ? [{ name: "programId", label: "", type: "hidden" as const }] : []),
    { name: "code", label: "Subject code", type: "text", required: true, placeholder: isCollege ? "IT101" : "MATH7" },
    { name: "name", label: "Subject name", type: "text", required: true },
    { name: "units", label: isCollege ? "Units" : "Units / credit", type: "number", step: "0.5", min: 0, required: true },
    { name: "lectureHours", label: "Lecture hours per week", type: "number", step: "0.5", min: 0, required: true },
    { name: "labHours", label: "Lab hours per week", type: "number", step: "0.5", min: 0, required: true },
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Reorder</span>
                </TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Subject</TableHead>
                {showStrand && <TableHead>Strand</TableHead>}
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Lec / Lab hrs</TableHead>
                <TableHead>Room</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <SortableList
              items={subjects}
              getLabel={(s) => s.code}
              onReorder={(ids) => reorderAction("subject", ids)}
              renderItem={(s, { setNodeRef, style, isDragging, handleProps }) => (
                <TableRow
                  ref={setNodeRef}
                  style={style}
                  data-roving=""
                  tabIndex={-1}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    dialog.openEdit(s);
                  }}
                  aria-label={`${s.code} ${s.name}, ${s.units} units. Press Enter to edit.`}
                  className={cn("cursor-pointer", isDragging && "bg-card shadow-lg")}
                >
                  <TableCell>
                    <DragHandle {...handleProps} />
                  </TableCell>
                  <TableCell className="font-medium">{s.code}</TableCell>
                  <TableCell>
                    {s.name}
                    {s.classes > 0 && <span className="block text-xs text-muted-foreground">{s.classes} scheduled classes</span>}
                  </TableCell>
                  {showStrand && <TableCell>{s.strand ? <Badge variant="secondary">{s.strand}</Badge> : <span className="text-xs text-muted-foreground">Core</span>}</TableCell>}
                  <TableCell className="text-right">{s.units}</TableCell>
                  <TableCell className="text-right">
                    {s.lectureHours} / {s.labHours}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROOM_TYPES.find((r) => r.value === s.requiredRoomType)?.label ?? s.requiredRoomType}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.code}`} />}>
                        <DotsThree className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => dialog.openEdit(s)}>
                          <PencilSimple className="size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => del.openEdit(s)}>
                          <Trash className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
        </div>
      )}

      <FormDialog
        open={!!dialog.state}
        onOpenChange={(o) => !o && dialog.close()}
        title={editing ? `Edit ${editing.code}` : "Add subject"}
        description={heading}
        fields={fields}
        values={editing ?? { ...context, units: isCollege ? 3 : 1, lectureHours: isCollege ? 3 : 4, labHours: 0, requiredRoomType: "LECTURE_ROOM" }}
        submitLabel={editing ? "Save changes" : "Add subject"}
        successMessage={editing ? "Subject updated" : "Subject added"}
        onSubmit={(fd) => saveSubjectAction(editing?.id ?? null, fd)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete ${deleting?.code ?? "subject"}?`}
        description="Subjects that are used by scheduled classes can't be deleted."
        successMessage="Subject deleted"
        onConfirm={() => deleteSubjectAction(deleting!.id)}
      />
    </Card>
  );
}
