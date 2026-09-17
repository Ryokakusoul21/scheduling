"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Upload,
  Undo2,
  Archive,
  Copy,
  Trash2,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import {
  updateScheduleStatusAction,
  deleteScheduleAction,
  duplicateScheduleAction,
  createScheduleAction,
} from "@/app/(dashboard)/schedules/actions";

interface Option {
  id: string;
  label: string;
}

interface ScheduleRow {
  id: string;
  semesterId: string;
  semesterLabel: string;
  subjectId: string;
  subjectLabel: string;
  sectionId: string;
  sectionLabel: string;
  facultyId: string;
  facultyLabel: string;
  roomId: string;
  roomLabel: string;
  component: string;
  dayOfWeek: string;
  startMin: number;
  endMin: number;
  status: string;
  version: number;
}

function formatTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PUBLISHED") return "default";
  if (status === "ARCHIVED") return "outline";
  return "secondary";
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export function SchedulesTable({
  schedules,
  semesters,
  sections,
  subjects,
  faculty,
  rooms,
}: {
  schedules: ScheduleRow[];
  semesters: Option[];
  sections: Option[];
  subjects: (Option & { component: string })[];
  faculty: Option[];
  rooms: Option[];
}) {
  const [semesterFilter, setSemesterFilter] = useState<string>("ALL");
  const [sectionFilter, setSectionFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [pending, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return schedules.filter(
      (s) =>
        (semesterFilter === "ALL" || s.semesterId === semesterFilter) &&
        (sectionFilter === "ALL" || s.sectionId === sectionFilter) &&
        (statusFilter === "ALL" || s.status === statusFilter)
    );
  }, [schedules, semesterFilter, sectionFilter, statusFilter]);

  function handleStatus(id: string, status: "PUBLISHED" | "DRAFT" | "ARCHIVED") {
    startTransition(async () => {
      const res = await updateScheduleStatusAction(id, status);
      if (res.ok) toast.success(`Status updated to ${status}.`);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteScheduleAction(id);
      toast.success("Schedule entry deleted.");
    });
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const res = await duplicateScheduleAction(id);
      if (res.ok) toast.success("Schedule entry duplicated as draft.");
    });
  }

  function handleCreate(formData: FormData) {
    setFormError(null);
    const input = {
      semesterId: String(formData.get("semesterId") ?? ""),
      subjectId: String(formData.get("subjectId") ?? ""),
      sectionId: String(formData.get("sectionId") ?? ""),
      facultyId: String(formData.get("facultyId") ?? ""),
      roomId: String(formData.get("roomId") ?? ""),
      component: String(formData.get("component") ?? "LECTURE") as "LECTURE" | "LABORATORY",
      dayOfWeek: String(formData.get("dayOfWeek") ?? "MONDAY") as ScheduleRow["dayOfWeek"] as never,
      startMin: timeToMin(String(formData.get("startTime") ?? "08:00")),
      endMin: timeToMin(String(formData.get("endTime") ?? "09:00")),
    };
    startTransition(async () => {
      const res = await createScheduleAction(input);
      if (res.ok) {
        toast.success("Schedule entry created.");
        setNewOpen(false);
      } else {
        setFormError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={semesterFilter} onValueChange={(v) => setSemesterFilter(v ?? "ALL")}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Semester" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Semesters</SelectItem>
              {semesters.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sectionFilter} onValueChange={(v) => setSectionFilter(v ?? "ALL")}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sections</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "ALL")}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="size-4" /> New Schedule
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Schedule Entry</DialogTitle>
            </DialogHeader>
            <form action={handleCreate}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="semesterId">Semester</FieldLabel>
                  <select name="semesterId" id="semesterId" required className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {semesters.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sectionId">Section</FieldLabel>
                  <select name="sectionId" id="sectionId" required className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="subjectId">Subject</FieldLabel>
                  <select name="subjectId" id="subjectId" required className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field orientation="responsive">
                  <div className="grid w-full grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="facultyId">Faculty</FieldLabel>
                      <select name="facultyId" id="facultyId" required className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                        {faculty.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="roomId">Room</FieldLabel>
                      <select name="roomId" id="roomId" required className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                        {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                </Field>
                <Field orientation="responsive">
                  <div className="grid w-full grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="component">Component</FieldLabel>
                      <select name="component" id="component" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                        <option value="LECTURE">Lecture</option>
                        <option value="LABORATORY">Laboratory</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="dayOfWeek">Day</FieldLabel>
                      <select name="dayOfWeek" id="dayOfWeek" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                        {DAYS.map((d) => <option key={d} value={d}>{d[0] + d.slice(1).toLowerCase()}</option>)}
                      </select>
                    </div>
                  </div>
                </Field>
                <Field orientation="responsive">
                  <div className="grid w-full grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="startTime">Start Time</FieldLabel>
                      <input type="time" name="startTime" id="startTime" defaultValue="08:00" required className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="endTime">End Time</FieldLabel>
                      <input type="time" name="endTime" id="endTime" defaultValue="09:00" required className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
                    </div>
                  </div>
                </Field>
                {formError && <FieldError>{formError}</FieldError>}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Create Entry
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Faculty</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Day / Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No schedule entries match the selected filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.subjectLabel}</TableCell>
                <TableCell>{s.sectionLabel}</TableCell>
                <TableCell>{s.facultyLabel}</TableCell>
                <TableCell>{s.roomLabel}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {s.dayOfWeek[0] + s.dayOfWeek.slice(1).toLowerCase()} · {formatTime(s.startMin)}–{formatTime(s.endMin)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {s.status !== "PUBLISHED" && (
                        <DropdownMenuItem onClick={() => handleStatus(s.id, "PUBLISHED")}>
                          <Upload className="size-4" /> Publish
                        </DropdownMenuItem>
                      )}
                      {s.status === "PUBLISHED" && (
                        <DropdownMenuItem onClick={() => handleStatus(s.id, "DRAFT")}>
                          <Undo2 className="size-4" /> Unpublish
                        </DropdownMenuItem>
                      )}
                      {s.status !== "ARCHIVED" && (
                        <DropdownMenuItem onClick={() => handleStatus(s.id, "ARCHIVED")}>
                          <Archive className="size-4" /> Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDuplicate(s.id)}>
                        <Copy className="size-4" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger
                          nativeButton={false}
                          render={
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={(e) => e.preventDefault()}
                            />
                          }
                        >
                          <Trash2 className="size-4" /> Delete
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this schedule entry?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes {s.subjectLabel} for {s.sectionLabel}. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={() => handleDelete(s.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
