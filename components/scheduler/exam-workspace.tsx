"use client";

import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DndContext, DragOverlay, KeyboardSensor, useDraggable, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from "@dnd-kit/core";
import { CalendarBlank, CaretLeft, CaretRight, CheckCircle, DotsSixVertical, Lightning, Plus, UploadSimple, UsersThree, Warning, WarningOctagon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState, SelectCard } from "@/components/ux/states";
import { usePersisted } from "@/hooks/use-persisted";
import { cn } from "@/lib/utils";
import { EXAM_PERIODS, EXAM_TYPE_LABELS, type ExamType } from "@/lib/examinations/types";
import { DEFAULT_EXAM_RULES, checkExaminations, hasHardConflict, type ExamIssue, type ExamSlot } from "@/lib/examinations/rules";
import { generateExaminationSchedule, stageIndex, yearGroup, type AutoScheduleResult } from "@/lib/examinations/auto-schedule";
import { ACADEMIC_LEVELS } from "@/lib/academics/levels";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_GRID, clampStart, formatRange, formatTime, timeOptions, yToMinutes, type Severity } from "@/lib/scheduler/timetable";
import type { DayOfWeek } from "@/lib/scheduler/types";
import { moveExamAction, removeExamAction, saveExamAction, saveGeneratedExamsAction, submitExamsAction, type ExamInput } from "@/app/(dashboard)/scheduler/exam-actions";
import { Timetable, type BlockInfo, type DropPreview } from "./timetable";
import { ChecksHeading, ChecksRail, FilterCard, FilterSelect, PanelSection, ScheduleHeader, type Perspective } from "./schedule-chrome";
import { collision, gridKeyboardCoordinates } from "./dnd-grid";
import type { SchedulerEntry } from "./types";

export interface ExamRecord extends ExamSlot {
  semesterId: string;
  subjectId: string;
  type: ExamType;
  status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
  notes: string;
  reviewNote: string | null;
}

export interface ExamData {
  terms: { id: string; level: string; programId: string | null; isActive: boolean; label: string }[];
  programs: { id: string; code: string; name: string; level: string }[];
  sections: { id: string; name: string; level: string; yearLevel: string | null; gradeLevel: string | null; programId: string | null; semesterId: string | null; studentCount: number }[];
  subjects: { id: string; code: string; name: string }[];
  faculty: { id: string; fullName: string; dayOff: DayOfWeek | null; availability: { dayOfWeek: DayOfWeek; startMin: number; endMin: number }[] }[];
  rooms: { id: string; roomName: string; capacity: number; foreign: boolean; availability: { dayOfWeek: DayOfWeek; startMin: number; endMin: number }[] }[];
  unavailable: { facultyId: string | null; roomId: string | null; start: string; end: string; startMin: number | null; endMin: number | null }[];
  exams: ExamRecord[];
  busy: ExamSlot[];
  classes: { sectionId: string; subjectId: string; facultyId: string; roomId: string; semesterId: string; component: "LECTURE" | "LABORATORY"; dayOfWeek: DayOfWeek; startMin: number; endMin: number }[];
  windows: { type: ExamType; window: { start: string; end: string } | null }[];
  blocked: [string, string][];
  canEdit: boolean;
  canSubmit: boolean;
  isAdmin: boolean;
}

const GRID = DEFAULT_GRID;
const DAYS: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DATE_DAYS: DayOfWeek[] = ["SUNDAY", ...DAYS, "SUNDAY"];
const TIMES = timeOptions({ ...GRID, dayEnd: 21 * 60 }).map((t) => ({ value: String(t.value), label: t.label }));
const STATUS_LABEL = { DRAFT: "Draft", REVIEW: "Awaiting approval", PUBLISHED: "Approved", ARCHIVED: "Archived" } as const;
const STATUS_STYLE = { DRAFT: "secondary", REVIEW: "outline", PUBLISHED: "default", ARCHIVED: "secondary" } as const;

const addDays = (date: string, n: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const longDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

type ClassRef = ExamData["classes"][number];
const classKey = (c: { sectionId: string; subjectId: string }) => `${c.sectionId}|${c.subjectId}`;

/** One class per section and subject: the lecture when there is one, else the earliest meeting. */
function uniqueClasses(classes: ClassRef[]) {
  const best = new Map<string, ClassRef>();
  for (const c of classes) {
    const cur = best.get(classKey(c));
    const rank = (x: ClassRef) => (x.component === "LECTURE" ? 0 : 1) * 1e6 + DAYS.indexOf(x.dayOfWeek) * 1e4 + x.startMin;
    if (!cur || rank(c) < rank(cur)) best.set(classKey(c), c);
  }
  return [...best.values()];
}

/** An examination starts as its class: same room, proctor, weekday, and time, on the first matching date of the window or week. */
function defaultsFor(c: ClassRef, win: { start: string; end: string } | null, weekDates: string[]): Partial<Draft> {
  let date = weekDates[DAYS.indexOf(c.dayOfWeek)];
  if (win) {
    date = win.start;
    for (let d = win.start; d <= win.end; d = addDays(d, 1)) if (DAYS[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7] === c.dayOfWeek) { date = d; break; }
  }
  return { sectionId: c.sectionId, subjectId: c.subjectId, roomId: c.roomId, proctorId: c.facultyId, date, startMin: c.startMin, endMin: c.endMin };
}

type Draft = { id?: string; sectionId: string; subjectId: string; roomId: string; proctorId: string; date: string; startMin: number; endMin: number; notes: string };
type Panel = "conflicts" | "todo" | "rules";
const PERSPECTIVE_LABEL: Record<Perspective, string> = { section: "sections", faculty: "proctors", room: "rooms" };

export function ExamWorkspace({ data, academicYearControl, modes }: { data: ExamData; academicYearControl?: React.ReactNode; modes?: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const dndId = useId();
  const [pending, startTransition] = useTransition();

  // Address parameters that point outside the scoped data fall back to the default view.
  const initial = useMemo(() => {
    const valid = (key: string, list: { id: string }[]) => (list.some((x) => x.id === params.get(key)) ? params.get(key)! : "");
    const term = valid("termId", data.terms) || (data.terms.find((t) => t.isActive) ?? data.terms[0])?.id || "";
    const period = (EXAM_PERIODS as readonly string[]).includes(params.get("period") ?? "") ? (params.get("period") as ExamType) : (data.windows.find((w) => w.window)?.type ?? "MIDTERM");
    const win = data.windows.find((w) => w.type === period)?.window;
    const week = /^\d{4}-\d{2}-\d{2}$/.test(params.get("week") ?? "") ? mondayOf(params.get("week")!) : mondayOf(win?.start ?? today());
    // A single program is pre-selected and its selector hidden.
    const program = data.programs.length === 1 ? data.programs[0].id : valid("programId", data.programs);
    return { term, period, week, program, section: valid("sectionId", data.sections), proctor: valid("facultyId", data.faculty), room: valid("roomId", data.rooms) };
  }, [params, data]);
  const [termId, setTermId] = useState(initial.term);
  const [period, setPeriod] = useState<ExamType>(initial.period);
  const [week, setWeek] = useState(initial.week);
  const [programId, setProgramId] = useState(initial.program);
  const [sectionId, setSectionId] = useState(initial.section);
  const [proctorId, setProctorId] = useState(initial.proctor);
  const [roomId, setRoomId] = useState(initial.room);
  const [openPanels, setOpenPanels] = usePersisted<Partial<Record<Panel, boolean>>>("exam-panels", {});
  const [panelHidden, setPanelHidden] = usePersisted("scheduler-panel-hidden", false);
  const [perspective, setPerspective] = useState<Perspective>("section");
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [autoPlan, setAutoPlan] = useState<AutoScheduleResult | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [needDrag, setNeedDrag] = useState<ClassRef | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);

  // Mirror the view to the address so direct links work.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "examinations");
    const set = (k: string, v: string) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    set("termId", termId); set("period", period); set("week", week); set("programId", data.programs.length > 1 ? programId : ""); set("sectionId", sectionId); set("facultyId", proctorId); set("roomId", roomId);
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [termId, period, week, programId, sectionId, proctorId, roomId, data.programs.length]);

  const maps = useMemo(() => ({
    subject: new Map(data.subjects.map((s) => [s.id, s])),
    section: new Map(data.sections.map((s) => [s.id, s])),
    faculty: new Map(data.faculty.map((f) => [f.id, f])),
    room: new Map(data.rooms.map((r) => [r.id, r])),
  }), [data]);

  const term = data.terms.find((t) => t.id === termId);
  const win = data.windows.find((w) => w.type === period)?.window ?? null;
  const sectionsInScope = useMemo(
    () => data.sections.filter((s) => s.semesterId === termId && (!programId || s.programId === programId)),
    [data.sections, termId, programId]
  );
  const sectionIds = useMemo(() => new Set(sectionsInScope.map((s) => s.id)), [sectionsInScope]);

  // Examinations of this term and period inside the chosen filters.
  const periodExams = useMemo(
    () => data.exams.filter((e) => e.semesterId === termId && e.type === period && sectionIds.has(e.sectionId) && (!sectionId || e.sectionId === sectionId) && (!proctorId || e.proctorId === proctorId) && (!roomId || e.roomId === roomId)),
    [data.exams, termId, period, sectionIds, sectionId, proctorId, roomId]
  );

  const rules = DEFAULT_EXAM_RULES;
  const context = useMemo(() => ({
    window: win,
    blockedDates: new Map(data.blocked),
    roomCapacity: new Map(data.rooms.map((r) => [r.id, r.capacity])),
    sectionSize: new Map(data.sections.map((s) => [s.id, s.studentCount])),
    busy: data.busy,
    rules,
  }), [win, data, rules]);
  // Conflicts consider every examination of the period, so a filter never hides a clash.
  const allPeriod = useMemo(() => data.exams.filter((e) => e.semesterId === termId && e.type === period), [data.exams, termId, period]);
  const issues = useMemo(() => checkExaminations(allPeriod, context), [allPeriod, context]);
  const visibleIssues = useMemo(() => issues.filter((i) => periodExams.some((e) => e.id === i.examId)), [issues, periodExams]);
  const hard = visibleIssues.filter((i) => i.severity === "conflict");
  const issueIndex = useMemo(() => {
    const map = new Map<string, { severity: Severity; messages: string[] }>();
    for (const i of visibleIssues) {
      const cur = map.get(i.examId) ?? { severity: "warning" as Severity, messages: [] };
      map.set(i.examId, { severity: i.severity === "conflict" ? "conflict" : cur.severity, messages: [...cur.messages, i.message] });
    }
    return map;
  }, [visibleIssues]);

  // The Unscheduled list is derived: the term's classes (one per section and subject) minus the examinations already placed for this period.
  const termClasses = useMemo(() => uniqueClasses(data.classes.filter((c) => c.semesterId === termId)), [data.classes, termId]);
  const unscheduled = useMemo(() => {
    const placed = new Set(allPeriod.filter((exam) => exam.status !== "ARCHIVED").map(classKey));
    return termClasses.filter((c) => sectionIds.has(c.sectionId) && (!sectionId || c.sectionId === sectionId) && !placed.has(classKey(c)));
  }, [termClasses, allPeriod, sectionIds, sectionId]);

  const dates = DAYS.map((_, i) => addDays(week, i));
  const dayOfDate = (date: string) => DAYS[dates.indexOf(date)];
  const entries: SchedulerEntry[] = useMemo(
    () => periodExams.filter((e) => dates.includes(e.date)).map((e) => ({
      id: e.id, semesterId: e.semesterId, sectionId: e.sectionId, subjectId: e.subjectId, facultyId: e.proctorId, roomId: e.roomId,
      component: "LECTURE", dayOfWeek: dayOfDate(e.date), startMin: e.startMin, endMin: e.endMin, status: e.status, notes: e.notes,
    })),
    // dates and dayOfDate derive from week only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodExams, week]
  );
  const examById = useMemo(() => new Map(data.exams.map((e) => [e.id, e])), [data.exams]);
  const colorIndex = useMemo(() => new Map(data.subjects.map((s, i) => [s.id, i])), [data.subjects]);

  const info = useCallback((e: SchedulerEntry): BlockInfo => ({
    title: maps.subject.get(e.subjectId)?.code ?? "?",
    subtitle: maps.subject.get(e.subjectId)?.name ?? "",
    lines: [maps.section.get(e.sectionId)?.name ?? "", maps.room.get(e.roomId)?.roomName ?? "", maps.faculty.get(e.facultyId)?.fullName ?? ""],
    colorIndex: colorIndex.get(e.subjectId) ?? 0,
    status: e.status,
  }), [maps, colorIndex]);

  const focused = sectionId || proctorId || roomId;
  // Sections with items start open until the person opens or closes them.
  const isOpen = (key: Panel, count: number) => openPanels[key] ?? count > 0;
  const togglePanel = (key: Panel, count: number) => setOpenPanels({ ...openPanels, [key]: !isOpen(key, count) });
  const focusName = sectionId ? maps.section.get(sectionId)?.name : proctorId ? maps.faculty.get(proctorId)?.fullName : roomId ? maps.room.get(roomId)?.roomName : null;
  // Cards shown until a section, proctor, or room is chosen, each with its examination count.
  const picks = useMemo(() => {
    const count = (key: "sectionId" | "proctorId" | "roomId", id: string) => allPeriod.filter((e) => e[key] === id).length;
    if (perspective === "faculty") return data.faculty.map((f) => ({ id: f.id, title: f.fullName, subtitle: "Proctor", count: count("proctorId", f.id) }));
    if (perspective === "room") return data.rooms.filter((r) => !r.foreign).map((r) => ({ id: r.id, title: r.roomName, subtitle: `${r.capacity} seats`, count: count("roomId", r.id) }));
    return sectionsInScope.map((s) => ({ id: s.id, title: s.name, subtitle: `${s.studentCount} students`, count: count("sectionId", s.id) }));
  }, [perspective, data.faculty, data.rooms, sectionsInScope, allPeriod]);

  // ---- Actions ----
  const openNew = useCallback((patch: Partial<Draft> = {}) => setDraft({ sectionId: sectionId, subjectId: "", roomId: "", proctorId: "", date: win?.start ?? dates[0], startMin: 480, endMin: 600, notes: "", ...patch }), [sectionId, win, dates]);
  const openClass = (c: ClassRef) => openNew({ ...defaultsFor(c, win, dates), notes: "" });
  const openExam = (e: SchedulerEntry) => {
    const x = examById.get(e.id);
    if (x) setDraft({ id: x.id, sectionId: x.sectionId, subjectId: x.subjectId, roomId: x.roomId, proctorId: x.proctorId, date: x.date, startMin: x.startMin, endMin: x.endMin, notes: x.notes });
  };
  function move(id: string, date: string, startMin: number) {
    const x = examById.get(id);
    if (!x) return;
    startTransition(async () => {
      const res = await moveExamAction({ id, date, startMin, endMin: startMin + (x.endMin - x.startMin) });
      if (!res.ok) toast.error(res.error);
    });
  }
  // Unscheduled classes of every section in scope, ignoring the section filter, for the generator selection.
  const pendingBySection = useMemo(() => {
    const placed = new Set(allPeriod.filter((exam) => exam.status !== "ARCHIVED").map(classKey));
    const counts = new Map<string, number>();
    for (const c of termClasses) if (sectionIds.has(c.sectionId) && !placed.has(classKey(c))) counts.set(c.sectionId, (counts.get(c.sectionId) ?? 0) + 1);
    return counts;
  }, [termClasses, allPeriod, sectionIds]);

  /** Generates examinations for the chosen sections and saves them as drafts, like the class scheduler. */
  function generateFor(selected: Set<string>) {
    if (!win) {
      toast.error(`An approved ${EXAM_TYPE_LABELS[period]} examination window is required before generating a schedule.`);
      return;
    }
    const placedKeys = new Set(allPeriod.filter((exam) => exam.status !== "ARCHIVED").map(classKey));
    const candidates = termClasses.filter((c) => selected.has(c.sectionId) && !placedKeys.has(classKey(c))).flatMap((item) => {
      const section = maps.section.get(item.sectionId);
      const subject = maps.subject.get(item.subjectId);
      const proctor = maps.faculty.get(item.facultyId);
      if (!section || !subject) return [];
      return [{
        sectionId: section.id,
        sectionName: section.name,
        sectionLevel: section.level,
        yearLevel: section.yearLevel,
        gradeLevel: section.gradeLevel,
        studentCount: section.studentCount,
        subjectId: item.subjectId,
        subjectCode: subject.code,
        proctorId: item.facultyId,
        proctorName: proctor?.fullName ?? "",
        proctorDayOff: proctor?.dayOff ?? null,
        proctorAvailability: proctor?.availability ?? [],
        roomId: item.roomId,
        startMin: item.startMin,
        endMin: item.endMin,
      }];
    });
    const existing = allPeriod.filter((exam) => exam.status !== "ARCHIVED").map((exam) => ({ ...exam, subjectId: exam.subjectId }));
    const scheduledClasses = win ? data.classes
      .filter((item) => item.semesterId === termId)
      .flatMap((item) => {
        const busy = [];
        for (let date = win.start; date <= win.end; date = addDays(date, 1)) {
          if (DATE_DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] !== item.dayOfWeek) continue;
          busy.push({
            id: `class-${item.sectionId}-${item.subjectId}-${date}-${item.startMin}`,
            date,
            startMin: item.startMin,
            endMin: item.endMin,
            sectionId: item.sectionId,
            roomId: item.roomId,
            proctorId: item.facultyId,
          });
        }
        return busy;
      }) : [];
    const plan = generateExaminationSchedule(
      candidates,
      existing,
      data.rooms.filter((room) => !room.foreign),
      context,
      scheduledClasses,
      data.unavailable,
    );
    startTransition(async () => {
      if (plan.proposals.length) {
        const result = await saveGeneratedExamsAction({
          semesterId: termId,
          type: period,
          exams: plan.proposals.map(({ sectionId, subjectId, roomId, proctorId, date, startMin, endMin }) => ({
            sectionId, subjectId, roomId, proctorId, date, startMin, endMin,
          })),
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${result.data.count} examination${result.data.count === 1 ? "" : "s"} added as drafts.`, { description: "Review each section timetable, then submit to the Registrar for approval." });
        // Open the first generated section on the week of its first examination.
        const first = [...plan.proposals].sort((a, b) => a.date.localeCompare(b.date))[0];
        setPerspective("section"); setProctorId(""); setRoomId("");
        setSectionId(plan.proposals[0].sectionId);
        setWeek(mondayOf(first.date));
        router.refresh();
      }
      // The dialog stays open only to list classes that could not be placed.
      if (plan.unscheduled.length) setAutoPlan(plan);
      else setGenerateOpen(false);
    });
  }
  function jump(examId: string) {
    const x = examById.get(examId);
    if (!x) return;
    setWeek(mondayOf(x.date));
    setHighlight(examId);
    setTimeout(() => setHighlight(null), 2500);
  }

  // ---- Drag and drop ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: gridKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } })
  );
  function target(event: DragMoveEvent | DragEndEvent): { date: string; startMin: number; duration: number } | null {
    const day = event.over?.data.current?.day as DayOfWeek | undefined;
    const translated = event.active.rect.current.translated;
    const x = examById.get(String(event.active.id).replace("entry:", ""));
    const duration = needDrag ? needDrag.endMin - needDrag.startMin : x ? x.endMin - x.startMin : 0;
    if (!event.over || !day || !duration) return null;
    let y: number;
    if (needDrag) {
      // Panel items are not block-shaped, so the pointer marks the start time.
      const activator = event.activatorEvent as PointerEvent | KeyboardEvent;
      if (!("clientY" in activator)) return null;
      y = activator.clientY + event.delta.y - event.over.rect.top - GRID.rowHeight / 2;
    } else if (translated) y = translated.top - event.over.rect.top;
    else return null;
    return { date: dates[DAYS.indexOf(day)], startMin: clampStart(yToMinutes(y, GRID), duration, GRID), duration };
  }
  const dragExam = activeId ? examById.get(activeId) : null;
  const heatmap = useMemo(() => {
    const result = new Map<DayOfWeek, "valid" | "warning" | "conflict">();
    if (!dragExam) return result;
    DAYS.forEach((day, i) => {
      const startMin = preview?.startMin ?? dragExam.startMin;
      const candidate = { ...dragExam, date: dates[i], startMin, endMin: startMin + dragExam.endMin - dragExam.startMin };
      const found = checkExaminations([...allPeriod.filter((e) => e.id !== dragExam.id), candidate], context).filter((x) => x.examId === dragExam.id);
      result.set(day, hasHardConflict(found) ? "conflict" : found.length ? "warning" : "valid");
    });
    return result;
    // dates derive from week only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragExam, preview?.startMin, allPeriod, context, week]);

  const drafts = allPeriod.filter((e) => e.status === "DRAFT");
  const draftHard = hasHardConflict(issues.filter((i) => drafts.some((d) => d.id === i.examId)));

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e) => { const need = e.active.data.current?.need as ClassRef | undefined; if (need) setNeedDrag(need); else setActiveId(String(e.active.id).replace("entry:", "")); }}
      onDragMove={(e) => { const t = target(e); setPreview(t ? { day: dayOfDate(t.date), startMin: t.startMin, endMin: t.startMin + t.duration } : null); }}
      onDragEnd={(e) => {
        const t = target(e); const id = String(e.active.id).replace("entry:", ""); const need = needDrag;
        setActiveId(null); setNeedDrag(null); setPreview(null);
        if (!t) return;
        // A dropped class opens the dialog on that slot, so the proctor and room can still be reviewed before saving.
        if (need) openNew({ ...defaultsFor(need, win, dates), date: t.date, startMin: t.startMin, endMin: t.startMin + t.duration });
        else move(id, t.date, t.startMin);
      }}
      onDragCancel={() => { setActiveId(null); setNeedDrag(null); setPreview(null); }}
      accessibility={{ container: typeof document === "undefined" ? undefined : document.body, screenReaderInstructions: { draggable: "Press Space to pick up this examination. Use the arrow keys to move it by 30 minutes or one day, Space to drop, or Escape to cancel. Press Enter to edit." } }}
    >
      <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-y-auto">
        <ScheduleHeader
          trail={
            <nav aria-label="Breadcrumb" className="flex items-center gap-1">
              <Link href="/dashboard" onClick={(e) => { if ((draft || pending) && !confirm("Leave with unsaved changes?")) e.preventDefault(); }} className="hover:text-foreground">Dashboard</Link> ›
              {focused ? <button type="button" onClick={() => { setSectionId(""); setProctorId(""); setRoomId(""); }} className="hover:text-foreground">Examination Schedules</button> : <span>Examination Schedules</span>} ›
              {focusName && <><span className="font-medium text-foreground">{focusName}</span> ›</>}
            </nav>
          }
          modes={modes}
          help="Each examination starts from its class schedule. Drag to change the date or time; hard conflicts block a save."
          leading={<>
            {academicYearControl}
            <div className="min-w-0 space-y-1 xl:w-64">
              <label htmlFor="exam-term" className="block text-sm text-muted-foreground">Term</label>
              <NativeSelect id="exam-term" value={termId} onChange={(e) => { setTermId(e.target.value); setSectionId(""); }} options={data.terms.map((t) => ({ value: t.id, label: t.label }))} />
            </div>
          </>}
        >
          {data.canSubmit && <Button variant="outline" disabled={!win || !pendingBySection.size || pending} onClick={() => setGenerateOpen(true)}><Lightning className="size-4" /> Auto-Schedule</Button>}
          {data.canSubmit && <Button variant="outline" disabled={!drafts.length} onClick={() => setSubmitOpen(true)}><UploadSimple className="size-4" /> Submit for Approval{drafts.length ? ` (${drafts.length})` : ""}</Button>}
          {data.isAdmin && <Button variant="outline" nativeButton={false} render={<Link href="/admin/review-center?queue=examinations" />}>Registrar Review Center</Button>}
        </ScheduleHeader>

        {/* Period, week, and the official window */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Examination period" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {EXAM_PERIODS.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={period === p} onClick={() => { setPeriod(p); const w = data.windows.find((x) => x.type === p)?.window; if (w) setWeek(mondayOf(w.start)); }}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", period === p ? "bg-background shadow-xs" : "hover:bg-background/60")}>
                {EXAM_TYPE_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1" aria-label="Week">
            <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><CaretLeft className="size-4" /></Button>
            <span className="min-w-28 text-center text-sm font-medium">{longDate(dates[0])} to {longDate(dates[5])}</span>
            <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><CaretRight className="size-4" /></Button>
          </div>
        {win ? (
          <p className="min-w-0 flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-sm"><CheckCircle className="mr-1 inline size-4 text-emerald-600" weight="fill" /> Official {EXAM_TYPE_LABELS[period]} window: {longDate(win.start)} to {longDate(win.end)} (approved Calendar of Activities).</p>
        ) : (
          <p role="alert" className="min-w-0 flex-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm"><Warning className="mr-1 inline size-4 text-amber-600" weight="fill" /> No approved window for the {EXAM_TYPE_LABELS[period]} examinations yet. <Link className="underline" href="/calendar/proposals">Propose one in the Calendar of Activities</Link>; dates are never guessed.</p>
        )}

        </div>

        <FilterCard
          expanded={filtersExpanded}
          onToggle={() => setFiltersExpanded((v) => !v)}
          activeCount={[programId, sectionId, proctorId, roomId].filter(Boolean).length}
          perspective={data.canSubmit ? undefined : perspective}
          onPerspective={(kind) => { setPerspective(kind); setSectionId(""); setProctorId(""); setRoomId(""); }}
        >
          {data.programs.length > 1 && <FilterSelect label="Program or strand" value={programId} onChange={(v) => { setProgramId(v); setSectionId(""); }} placeholder="All programs and strands" options={data.programs.map((p) => ({ value: p.id, label: p.code, title: p.name }))} />}
          <FilterSelect label="Section" value={sectionId} onChange={setSectionId} placeholder={`All sections (${sectionsInScope.length})`} options={sectionsInScope.map((s) => ({ value: s.id, label: s.name }))} />
          <FilterSelect label="Proctor" value={proctorId} onChange={setProctorId} placeholder="Any proctor" options={data.faculty.map((f) => ({ value: f.id, label: f.fullName }))} />
          <FilterSelect label="Room" value={roomId} onChange={setRoomId} placeholder="Any room" options={data.rooms.filter((r) => !r.foreign).map((r) => ({ value: r.id, label: `${r.roomName} · ${r.capacity} seats` }))} />
          {pending && <span className="self-end pb-2 text-xs text-muted-foreground">Saving...</span>}
        </FilterCard>

        <div className={cn("grid gap-3 lg:min-h-[30rem] lg:flex-1 lg:overflow-hidden", panelHidden ? "lg:grid-cols-[minmax(0,1fr)_48px]" : "lg:grid-cols-[minmax(0,1fr)_320px]")}>
          <section aria-label="Timetable" className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto pr-1">
            {focused ? (
              <Timetable days={DAYS} entries={entries} info={info} conflictIndex={issueIndex} editable={data.canEdit && !data.isAdmin} highlightId={highlight} preview={preview} heatmap={heatmap} onOpen={openExam} onEmptySlot={data.canEdit && !data.isAdmin ? (day, start) => openNew({ date: dates[DAYS.indexOf(day)], startMin: start, endMin: start + 120 }) : undefined} grid={GRID} />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Choose {perspective === "section" ? "a section" : perspective === "faculty" ? "a proctor" : "a room"} to open its examination timetable.</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {picks.map((x) => (
                    <SelectCard key={x.id} title={x.title} subtitle={x.subtitle} icon={UsersThree} onSelect={() => { if (perspective === "section") setSectionId(x.id); else if (perspective === "faculty") setProctorId(x.id); else setRoomId(x.id); }}
                      meta={<Badge variant="secondary">{x.count} examination{x.count === 1 ? "" : "s"}</Badge>} />
                  ))}
                </div>
                {picks.length === 0 && <EmptyState title={`No ${PERSPECTIVE_LABEL[perspective]} match these filters`} description="Try a different term or program." />}
              </div>
            )}
          </section>

          {/* Inspector */}
          <aside aria-label="Examination checks" className="min-h-0 space-y-2 overflow-y-auto">
            {panelHidden ? <ChecksRail total={hard.length + unscheduled.length} conflicts={hard.length} onShow={() => setPanelHidden(false)} /> : <>
              <ChecksHeading total={hard.length + unscheduled.length} conflicts={hard.length} onHide={() => setPanelHidden(true)} />
              <PanelSection id="conflicts" title="Conflicts" count={hard.length} tone={hard.length ? "destructive" : "secondary"} open={isOpen("conflicts", hard.length)} onToggle={() => togglePanel("conflicts", hard.length)}>
                <IssueList issues={visibleIssues} examById={examById} maps={maps} onJump={jump} />
              </PanelSection>
              <PanelSection id="todo" title="Unscheduled" count={unscheduled.length} open={isOpen("todo", unscheduled.length)} onToggle={() => togglePanel("todo", unscheduled.length)}>
                {unscheduled.length === 0 ? <EmptyState icon={CheckCircle} title="Every class has an examination" description={`Nothing left to place for the ${EXAM_TYPE_LABELS[period]} period in this view.`} className="py-8" /> : (
                  <ul className="space-y-2">
                    {unscheduled.map((u) => (
                      <UnscheduledItem key={classKey(u)} cls={u} subject={maps.subject.get(u.subjectId)} section={maps.section.get(u.sectionId)} room={maps.room.get(u.roomId)} proctor={maps.faculty.get(u.facultyId)} editable={data.canEdit && !data.isAdmin} onPlace={() => openClass(u)} />
                    ))}
                  </ul>
                )}
              </PanelSection>
              <PanelSection id="rules" title="Constraints" open={isOpen("rules", 0)} onToggle={() => togglePanel("rules", 0)}>
                <div className="space-y-2 rounded-lg border bg-card p-3 text-sm">
                  <p className="font-semibold">Rules applied to every examination</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>Rooms, proctors, and sections are never double-booked.</li>
                    <li>Room capacity must fit the section.</li>
                    <li>Only dates inside the official window; never holidays, class suspensions, or other approved activity days.</li>
                    <li>At least {rules.bufferMin} minutes between examinations of the same section or proctor.</li>
                    <li>At most {rules.maxPerSectionPerDay} examinations per section per day.</li>
                    <li>Lunch break {formatTime(rules.lunchStartMin)} to {formatTime(rules.lunchEndMin)} is avoided.</li>
                  </ul>
                  {term && <p className="text-xs text-muted-foreground">Term: {term.label}</p>}
                </div>
              </PanelSection>
            </>}
          </aside>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {needDrag ? (
          <div className="pointer-events-none w-40 rounded-md border-2 border-primary bg-card px-2 py-1.5 text-xs shadow-lg">
            <p className="font-semibold">{maps.subject.get(needDrag.subjectId)?.code}</p>
            <p className="text-muted-foreground">{preview ? `${preview.day.slice(0, 3)} ${formatTime(preview.startMin)}` : "Drop on the timetable"}</p>
          </div>
        ) : null}
      </DragOverlay>
      {draft && <ExamDialog key={draft.id ?? "new"} draft={draft} data={data} type={period} termId={termId} classes={termClasses} win={win} dates={dates} context={context} others={allPeriod} onClose={() => setDraft(null)} />}
      {submitOpen && <SubmitDialog rows={allPeriod} issues={issues} draftHard={draftHard} maps={maps} onClose={() => setSubmitOpen(false)} />}
      {(generateOpen || autoPlan) && (
        <GenerateExamsDialog
          sections={sectionsInScope}
          pendingBySection={pendingBySection}
          initial={sectionId}
          period={EXAM_TYPE_LABELS[period]}
          plan={autoPlan}
          busy={pending}
          onGenerate={generateFor}
          onClose={() => { setGenerateOpen(false); setAutoPlan(null); }}
        />
      )}
    </DndContext>
  );
}

type ScopeSection = ExamData["sections"][number];

/** Pick year levels and sections to generate, then list any classes that could not be placed. */
function GenerateExamsDialog({ sections, pendingBySection, initial, period, plan, busy, onGenerate, onClose }: { sections: ScopeSection[]; pendingBySection: Map<string, number>; initial: string; period: string; plan: AutoScheduleResult | null; busy: boolean; onGenerate: (selected: Set<string>) => void; onClose: () => void }) {
  // Sections with classes still waiting, grouped by academic level and year, in curriculum order.
  const groups = useMemo(() => {
    const stage = (s: ScopeSection) => ({ sectionLevel: s.level, yearLevel: s.yearLevel, gradeLevel: s.gradeLevel });
    const sorted = sections.filter((s) => pendingBySection.has(s.id)).sort((a, b) =>
      ACADEMIC_LEVELS.indexOf(a.level as (typeof ACADEMIC_LEVELS)[number]) - ACADEMIC_LEVELS.indexOf(b.level as (typeof ACADEMIC_LEVELS)[number]) ||
      stageIndex(stage(a)) - stageIndex(stage(b)) || a.name.localeCompare(b.name));
    const map = new Map<string, ScopeSection[]>();
    for (const s of sorted) map.set(yearGroup(stage(s)), [...(map.get(yearGroup(stage(s))) ?? []), s]);
    return [...map];
  }, [sections, pendingBySection]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pendingBySection.has(initial) ? [initial] : []));
  const toggle = (ids: string[], on: boolean) => setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => (on ? next.add(id) : next.delete(id))); return next; });
  const classCount = [...selected].reduce((n, id) => n + (pendingBySection.get(id) ?? 0), 0);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {plan ? (
          <>
            <DialogHeader>
              <DialogTitle>Some classes could not be placed</DialogTitle>
              <DialogDescription>{plan.proposals.length} examination{plan.proposals.length === 1 ? " was" : "s were"} added as drafts. Place these {plan.unscheduled.length} manually from the Unscheduled panel.</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm">
              {plan.unscheduled.map((item, index) => <li key={`${item.sectionName}-${item.subjectCode}-${index}`} className="rounded-lg border p-2.5"><span className="font-medium">{item.subjectCode} · {item.sectionName}</span><span className="block text-muted-foreground">{item.reason}</span></li>)}
            </ul>
            <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Auto-Schedule {period} Examinations</DialogTitle>
              <DialogDescription>Choose the year levels or sections to generate. Each examination starts from its class schedule, keeps the class teacher as proctor, and is saved as a draft on the timetable.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {groups.map(([group, list]) => {
                const ids = list.map((s) => s.id);
                const all = ids.every((id) => selected.has(id));
                const some = !all && ids.some((id) => selected.has(id));
                return (
                  <section key={group} className="rounded-lg border">
                    <label className="flex cursor-pointer items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-semibold">
                      <Checkbox checked={all} indeterminate={some} onCheckedChange={(on) => toggle(ids, !!on)} />
                      {group}
                      <span className="ml-auto text-xs font-normal text-muted-foreground">{list.length} section{list.length === 1 ? "" : "s"}</span>
                    </label>
                    <div className="grid gap-1 p-2 sm:grid-cols-2">
                      {list.map((s) => (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                          <Checkbox checked={selected.has(s.id)} onCheckedChange={(on) => toggle([s.id], !!on)} />
                          <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          <Badge variant="secondary">{pendingBySection.get(s.id)} to place</Badge>
                        </label>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <DialogFooter className="items-center gap-2">
              <span className="mr-auto text-sm text-muted-foreground">{selected.size} section{selected.size === 1 ? "" : "s"} · {classCount} examination{classCount === 1 ? "" : "s"}</span>
              <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={() => onGenerate(selected)} disabled={busy || !selected.size}><Lightning className="size-4" /> {busy ? "Generating..." : "Generate"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A class still without an examination; drag it onto the timetable or press Place. */
function UnscheduledItem({ cls, subject, section, room, proctor, editable, onPlace }: { cls: ClassRef; subject?: { code: string; name: string }; section?: { name: string }; room?: { roomName: string }; proctor?: { fullName: string }; editable: boolean; onPlace: () => void }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `need:${classKey(cls)}`, disabled: !editable, data: { need: cls } });
  return (
    <li ref={setNodeRef} {...listeners} {...attributes} className={cn("touch-none rounded-lg border bg-card p-2.5 text-sm", editable && "cursor-grab active:cursor-grabbing", isDragging && "opacity-50")}>
      <p className="flex items-center gap-1 font-semibold">{editable && <DotsSixVertical className="size-4 shrink-0 text-muted-foreground" weight="bold" />}{subject?.code} <span className="font-normal text-muted-foreground">{subject?.name}</span></p>
      <p className="text-xs text-muted-foreground">{section?.name} · Class: {cls.dayOfWeek.slice(0, 3)} {formatRange(cls.startMin, cls.endMin)} · {room?.roomName ?? "No room"} · Proctor: {proctor?.fullName ?? "Vacant"}</p>
      {editable && <Button size="sm" variant="outline" className="mt-2" onPointerDown={(e) => e.stopPropagation()} onClick={onPlace}><Plus className="size-3.5" /> Place</Button>}
    </li>
  );
}

function IssueList({ issues, examById, maps, onJump }: { issues: ExamIssue[]; examById: Map<string, ExamRecord>; maps: { subject: Map<string, { code: string }>; section: Map<string, { name: string }> }; onJump: (id: string) => void }) {
  if (!issues.length) return <EmptyState icon={CheckCircle} title="No conflicts" description="No room, proctor, or section overlaps in the current view." className="border-emerald-500/30 bg-emerald-500/5 py-8" />;
  const sorted = [...issues].sort((a, b) => Number(b.severity === "conflict") - Number(a.severity === "conflict"));
  return (
    <ul className="space-y-1.5">
      {sorted.map((i, n) => {
        const x = examById.get(i.examId);
        return (
          <li key={`${i.examId}-${i.code}-${n}`}>
            <button type="button" onClick={() => onJump(i.examId)} className={cn("w-full rounded-lg border p-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", i.severity === "conflict" ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5")}>
              <span className="flex items-center gap-1 font-semibold">{i.severity === "conflict" ? <WarningOctagon className="size-3.5 text-red-600" weight="fill" /> : <Warning className="size-3.5 text-amber-600" weight="fill" />}{i.severity === "conflict" ? "Conflict" : "Warning"}: {x ? `${maps.subject.get(x.subjectId)?.code} · ${maps.section.get(x.sectionId)?.name}` : "Examination"}</span>
              <span className="block text-muted-foreground">{i.message}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ExamDialog({ draft, data, type, termId, classes, win, dates, context, others, onClose }: { draft: Draft; data: ExamData; type: ExamType; termId: string; classes: ClassRef[]; win: { start: string; end: string } | null; dates: string[]; context: Parameters<typeof checkExaminations>[1]; others: ExamRecord[]; onClose: () => void }) {
  const [f, setF] = useState(draft);
  const [changeReason, setChangeReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((p) => ({ ...p, [k]: v }));
  const live = useMemo(() => {
    if (!f.sectionId || !f.roomId || !f.proctorId || !f.date) return [];
    const slot: ExamSlot = { id: f.id ?? "new", date: f.date, startMin: f.startMin, endMin: f.endMin, sectionId: f.sectionId, roomId: f.roomId, proctorId: f.proctorId };
    return checkExaminations([...others.filter((e) => e.id !== f.id), slot], context).filter((i) => i.examId === slot.id);
  }, [f, others, context]);
  const subjectOf = new Map(data.subjects.map((s) => [s.id, s]));
  const sectionOf = new Map(data.sections.map((s) => [s.id, s]));
  const submittedExam = data.exams.find((exam) => exam.id === f.id);
  const needsChangeReason = !!f.id && (submittedExam?.status === "PUBLISHED" || submittedExam?.status === "REVIEW");
  const locked = !data.canEdit || submittedExam?.status === "REVIEW" || (data.isAdmin ? submittedExam?.status !== "PUBLISHED" : submittedExam?.status === "PUBLISHED");
  const classOptions = classes.filter((c) => sectionOf.has(c.sectionId)).map((c) => ({ value: classKey(c), label: `${subjectOf.get(c.subjectId)?.code ?? "?"} · ${sectionOf.get(c.sectionId)?.name}` }));
  // Choosing a class fills the room, proctor, and time from its class schedule; the Head of Department can then change them.
  const pickClass = (key: string) => {
    const c = classes.find((x) => classKey(x) === key);
    setF((p) => (c ? { ...p, ...defaultsFor(c, win, dates) } as Draft : { ...p, sectionId: "", subjectId: "" }));
  };

  function save() {
    setError(null);
    if (needsChangeReason && !changeReason.trim()) {
      setError("Document a reason before changing this submitted examination.");
      return;
    }
    const input: ExamInput = { semesterId: termId, sectionId: f.sectionId, subjectId: f.subjectId, roomId: f.roomId, proctorId: f.proctorId, type, date: f.date, startMin: f.startMin, endMin: f.endMin, notes: f.notes };
    startTransition(async () => {
      const res = await saveExamAction(input, f.id, changeReason);
      if (res.ok) { toast.success(submittedExam?.status === "PUBLISHED" && data.isAdmin ? "Published examination updated." : "Examination saved as a draft."); onClose(); } else setError(res.error);
    });
  }
  function remove() {
    if (!f.id) return;
    startTransition(async () => {
      const res = await removeExamAction(f.id!, changeReason);
      if (res.ok) { toast.success(submittedExam?.status === "PUBLISHED" && data.isAdmin ? "Published examination removed." : "Moved to Unscheduled. The class still needs an examination slot."); onClose(); } else setError(res.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{f.id ? "Edit Examination" : "Add Examination"} · {EXAM_TYPE_LABELS[type]}</DialogTitle></DialogHeader>
        {locked && <p className="text-sm text-muted-foreground">{submittedExam?.status === "REVIEW" ? "This examination is waiting for a Registrar decision." : data.isAdmin ? "The Registrar may correct published examinations only." : "Published examination schedules are locked. Ask the Registrar to record a documented change."}</p>}
        <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2">
          <Field className="sm:col-span-2"><FieldLabel htmlFor="x-class">Class</FieldLabel><NativeSelect id="x-class" value={f.sectionId && f.subjectId ? classKey(f) : ""} disabled={!!f.id} onChange={(e) => pickClass(e.target.value)} placeholder="Choose a scheduled class" options={classOptions} /></Field>
          <Field><FieldLabel htmlFor="x-room">Room</FieldLabel><NativeSelect id="x-room" value={f.roomId} onChange={(e) => set("roomId", e.target.value)} placeholder="Choose a room" options={data.rooms.map((r) => ({ value: r.id, label: `${r.roomName} · ${r.capacity} seats${r.foreign ? " (another department)" : ""}`, disabled: r.foreign }))} /></Field>
          <Field><FieldLabel htmlFor="x-proctor">Proctor</FieldLabel><NativeSelect id="x-proctor" value={f.proctorId} onChange={(e) => set("proctorId", e.target.value)} placeholder="Choose a proctor" options={data.faculty.map((p) => ({ value: p.id, label: p.fullName }))} /></Field>
          <Field><FieldLabel htmlFor="x-date">Date</FieldLabel><Input id="x-date" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field><FieldLabel htmlFor="x-start">Start</FieldLabel><NativeSelect id="x-start" value={String(f.startMin)} onChange={(e) => set("startMin", Number(e.target.value))} options={TIMES} /></Field>
            <Field><FieldLabel htmlFor="x-end">End</FieldLabel><NativeSelect id="x-end" value={String(f.endMin)} onChange={(e) => set("endMin", Number(e.target.value))} options={TIMES} /></Field>
          </div>
          </fieldset>
          {submittedExam?.status === "PUBLISHED" && data.isAdmin && <Field><FieldLabel htmlFor="x-change-reason">Reason for published examination change</FieldLabel><Textarea id="x-change-reason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} maxLength={500} required /></Field>}
        {live.length > 0 && (
          <ul className="space-y-1 text-xs" aria-live="polite">
            {live.map((i, n) => <li key={n} className={i.severity === "conflict" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}>{i.severity === "conflict" ? "Conflict" : "Warning"}: {i.message}</li>)}
          </ul>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          {!locked && f.id && <Button variant="outline" disabled={busy} onClick={remove}>Move to Unscheduled</Button>}
          {!locked && <Button disabled={busy || !f.sectionId || !f.subjectId || !f.roomId || !f.proctorId || hasHardConflict(live)} onClick={save}>{data.isAdmin ? "Save published correction" : "Save as Draft"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One table of every examination row in the period; only drafts are sent, and not while hard conflicts remain. */
function SubmitDialog({ rows, issues, draftHard, maps, onClose }: { rows: ExamRecord[]; issues: ExamIssue[]; draftHard: boolean; maps: { subject: Map<string, { code: string }>; section: Map<string, { name: string }>; faculty: Map<string, { fullName: string }>; room: Map<string, { roomName: string }> }; onClose: () => void }) {
  const [busy, startTransition] = useTransition();
  const drafts = rows.filter((r) => r.status === "DRAFT" || r.status === "REVIEW");
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  function submit() {
    startTransition(async () => {
      const res = await submitExamsAction(drafts.map((d) => d.id));
      if (res.ok) { toast.success(`${res.data.count} examination(s) sent to the Registrar.`); onClose(); } else toast.error(res.error);
    });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader><DialogTitle>Submit Examination Schedule for Approval</DialogTitle></DialogHeader>
        <div className="max-h-[50vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Subject</TableHead><TableHead>Section</TableHead><TableHead>Room</TableHead><TableHead>Proctor</TableHead><TableHead>Status</TableHead><TableHead>Conflicts</TableHead></TableRow></TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const mine = issues.filter((i) => i.examId === r.id && i.severity === "conflict");
                return (
                  <TableRow key={r.id}>
                    <TableCell>{longDate(r.date)}</TableCell><TableCell>{formatRange(r.startMin, r.endMin)}</TableCell>
                    <TableCell>{maps.subject.get(r.subjectId)?.code}</TableCell><TableCell>{maps.section.get(r.sectionId)?.name}</TableCell>
                    <TableCell>{maps.room.get(r.roomId)?.roomName}</TableCell><TableCell>{maps.faculty.get(r.proctorId)?.fullName}</TableCell>
                    <TableCell><Badge variant={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                    <TableCell>{mine.length ? <span className="text-red-700 dark:text-red-300"><WarningOctagon className="mr-1 inline size-3.5" weight="fill" />{mine.length} conflict(s)</span> : <span className="text-muted-foreground"><CalendarBlank className="mr-1 inline size-3.5" />None</span>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {draftHard && <p role="alert" className="text-sm text-destructive">Resolve the hard conflicts before submitting.</p>}
        <DialogFooter><Button disabled={busy || draftHard || !drafts.length} onClick={submit}>Submit {drafts.length} Draft{drafts.length === 1 ? "" : "s"} for Approval</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
