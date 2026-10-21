"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  CalendarDots,
  CheckCircle,
  FunnelSimple,
  Plus,
  Rows,
  SquaresFour,
  UploadSimple,
  UsersThree,
  WarningOctagon,
  X,
} from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState, SelectCard } from "@/components/ux/states";
import { BackButton } from "@/components/ux/back-button";
import { ReportButtons } from "@/components/ux/export-buttons";
import { timetableDoc } from "@/lib/export/report";
import { useShortcut } from "@/components/ux/shortcuts";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { cn } from "@/lib/utils";
import { detectConflicts, isOverlapConflict, type ConflictContext } from "@/lib/scheduler/conflictDetector";
import {
  DAY_LONG,
  DEFAULT_GRID,
  WEEK_DAYS,
  clampStart,
  defaultDuration,
  formatTime,
  indexConflicts,
  remainingNeeds,
  subjectAppliesToSection,
  yToMinutes,
  type SubjectNeed,
} from "@/lib/scheduler/timetable";
import { rankFaculty, rankRooms } from "@/lib/scheduler/suggest";
import type { DayOfWeek, SchedEntry } from "@/lib/scheduler/types";
import { stageLabel } from "@/lib/academics/levels";
import { deleteClassAction, moveClassAction, publishClassesAction, saveClassAction, type ClassInput } from "@/app/(dashboard)/scheduler/actions";

import { Timetable, PALETTE, type BlockInfo, type DropPreview } from "./timetable";
import { ClassDialog, type ClassDraft } from "./class-dialog";
import { ConflictsPanel, UnscheduledPanel } from "./side-panels";
import { ConstraintReportPanel, useOverridePrompt } from "./constraint-feedback";
import { ScheduleList, type RowInfo } from "./schedule-list";
import { ACTIVE_TERMS, useSchedulerFilters, type Filters } from "./use-scheduler-filters";
import type { SchedulerData, SchedulerEntry, SchedulerPermissions } from "./types";

export type ConflictContextBuilder = () => ConflictContext;

type ActiveDrag =
  | { kind: "entry"; entry: SchedulerEntry; duration: number }
  | { kind: "need"; need: SubjectNeed; duration: number };

const GRID = DEFAULT_GRID;

/** Prefer the pointer's column; fall back to the nearest column for keyboard drags. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

/** Keyboard dragging moves one slot vertically and one day horizontally per key press. */
const gridKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const colWidth = [...context.droppableRects.values()][0]?.width ?? 120;
  const steps: Record<string, [number, number]> = {
    ArrowDown: [0, GRID.rowHeight],
    ArrowUp: [0, -GRID.rowHeight],
    ArrowRight: [colWidth, 0],
    ArrowLeft: [-colWidth, 0],
  };
  const step = steps[event.code];
  if (!step) return undefined;
  event.preventDefault();
  return { x: currentCoordinates.x + step[0], y: currentCoordinates.y + step[1] };
};

export function SchedulerWorkspace({
  data: initial,
  permissions,
  defaults,
}: {
  data: SchedulerData;
  permissions: SchedulerPermissions;
  defaults: Partial<Filters>;
}) {
  // Local copy of the classes for optimistic drag-and-drop; re-synced when the server sends new data.
  const [entries, setEntries] = useState(initial.entries);
  const [syncedFrom, setSyncedFrom] = useState(initial.entries);
  if (initial.entries !== syncedFrom) {
    setSyncedFrom(initial.entries);
    setEntries(initial.entries);
  }
  const data = useMemo(() => ({ ...initial, entries }), [initial, entries]);
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const { filters, update, options, scopeEntries, visibleEntries, focus, revealEntry } = useSchedulerFilters(
    data,
    defaults
  );

  const dndId = useId();
  const [view, setView] = useState<"timetable" | "table">("timetable");
  const [panel, setPanel] = useState<"conflicts" | "todo" | "rules">("conflicts");
  // Requests still being saved; together with an open class dialog these count as unsaved changes.
  const [pending, setPending] = useState(0);
  const { prompt: promptOverride, dialog: overrideDialog } = useOverridePrompt();
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [dialog, setDialog] = useState<ClassDraft | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------
  const maps = useMemo(
    () => ({
      subject: new Map(data.subjects.map((s) => [s.id, s])),
      section: new Map(data.sections.map((s) => [s.id, s])),
      faculty: new Map(data.faculty.map((f) => [f.id, f])),
      room: new Map(data.rooms.map((r) => [r.id, r])),
      program: new Map(data.programs.map((p) => [p.id, p])),
      term: new Map(data.terms.map((t) => [t.id, t])),
    }),
    [data.subjects, data.sections, data.faculty, data.rooms, data.programs, data.terms]
  );

  const colorIndex = useMemo(() => {
    const ids = [...new Set(data.subjects.map((s) => s.id))];
    return new Map(ids.map((id, i) => [id, i % PALETTE.length]));
  }, [data.subjects]);

  const buildContext = useCallback<ConflictContextBuilder>(
    () => ({
      facultyById: new Map(
        data.faculty.map((f) => [f.id, { id: f.id, fullName: f.fullName, maxHours: f.maxHours, availability: f.availability, assignedHours: 0 }])
      ),
      roomById: new Map(data.rooms.map((r) => [r.id, { ...r, availability: r.availability }])),
      subjectById: new Map(data.subjects.map((s) => [s.id, s])),
      sectionStudentCountById: new Map(data.sections.map((s) => [s.id, s.studentCount])),
      termRanges: new Map(data.terms.map((t) => [t.id, { start: t.start, end: t.end }])),
    }),
    [data.faculty, data.rooms, data.subjects, data.sections, data.terms]
  );

  // ---------------------------------------------------------------------------
  // Conflicts (computed live over the whole academic year, then scoped)
  // ---------------------------------------------------------------------------
  const allConflicts = useMemo(
    () => detectConflicts(entries.filter((e) => e.status !== "ARCHIVED"), buildContext()),
    [entries, buildContext]
  );
  const conflictIndex = useMemo(() => indexConflicts(allConflicts, isOverlapConflict), [allConflicts]);
  const scopeIds = useMemo(() => new Set(scopeEntries.map((e) => e.id)), [scopeEntries]);
  const scopedConflicts = useMemo(
    () =>
      allConflicts
        .filter((c) => scopeIds.has(c.entryA.id!) || (c.entryB?.id && scopeIds.has(c.entryB.id)))
        .sort((a, b) => Number(isOverlapConflict(b)) - Number(isOverlapConflict(a))),
    [allConflicts, scopeIds]
  );
  const overlapCount = scopedConflicts.filter(isOverlapConflict).length;

  // ---------------------------------------------------------------------------
  // Labels
  // ---------------------------------------------------------------------------
  const blockInfo = useCallback(
    (e: SchedulerEntry): BlockInfo => {
      const subject = maps.subject.get(e.subjectId);
      const lines = [
        focus?.kind !== "section" ? maps.section.get(e.sectionId)?.name : null,
        focus?.kind !== "faculty" ? maps.faculty.get(e.facultyId)?.fullName : null,
        focus?.kind !== "room" ? maps.room.get(e.roomId)?.roomName : null,
      ].filter(Boolean) as string[];
      return {
        title: `${subject?.code ?? "?"}${e.component === "LABORATORY" ? " (Lab)" : ""}`,
        subtitle: subject?.name ?? "",
        lines,
        colorIndex: colorIndex.get(e.subjectId) ?? 0,
        status: e.status,
      };
    },
    [maps, colorIndex, focus?.kind]
  );

  const rowInfo = useCallback(
    (e: SchedulerEntry): RowInfo => ({
      subject: maps.subject.get(e.subjectId)?.code ?? "?",
      subjectName: maps.subject.get(e.subjectId)?.name ?? "",
      section: maps.section.get(e.sectionId)?.name ?? "?",
      faculty: maps.faculty.get(e.facultyId)?.fullName ?? "?",
      room: maps.room.get(e.roomId)?.roomName ?? "?",
    }),
    [maps]
  );

  const describe = useCallback(
    (e: SchedEntry) => {
      const r = rowInfo(e as SchedulerEntry);
      return `${r.subject} · ${r.section} · ${DAY_LONG[e.dayOfWeek].slice(0, 3)} ${formatTime(e.startMin)} · ${r.room} · ${r.faculty}`;
    },
    [rowInfo]
  );

  // ---------------------------------------------------------------------------
  // Terms & needs
  // ---------------------------------------------------------------------------
  /** Term a new class for this section should go into. */
  const termForSection = useCallback(
    (sectionId: string) => {
      if (filters.termId !== ACTIVE_TERMS) return filters.termId;
      const section = maps.section.get(sectionId);
      if (!section) return "";
      const candidates = data.terms.filter((t) => t.level === section.level && (!t.programId || t.programId === section.programId));
      const pick =
        candidates.find((t) => t.isActive && t.programId === section.programId) ??
        candidates.find((t) => t.isActive) ??
        candidates[0];
      return pick?.id ?? "";
    },
    [filters.termId, maps.section, data.terms]
  );

  const focusedSection = focus?.kind === "section" ? maps.section.get(focus.id) : undefined;
  const needs = useMemo(() => {
    if (!focusedSection) return [];
    const termId = termForSection(focusedSection.id);
    const subjects = data.subjects.filter((s) => !s.archived && subjectAppliesToSection(s, focusedSection));
    return remainingNeeds(
      focusedSection,
      subjects,
      entries.filter((e) => e.semesterId === termId && e.status !== "ARCHIVED")
    );
  }, [focusedSection, data.subjects, entries, termForSection]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const flash = useCallback((id: string) => {
    setHighlightId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2400);
  }, []);

  const conflictsFor = useCallback(
    (entry: SchedulerEntry, list: SchedulerEntry[]) =>
      detectConflicts(list.filter((e) => e.status !== "ARCHIVED"), buildContext()).filter(
        (c) => isOverlapConflict(c) && (c.entryA.id === entry.id || c.entryB?.id === entry.id)
      ),
    [buildContext]
  );

  // Lets the toast's Undo button call the latest moveEntry without a self-reference.
  const moveRef = useRef<(entry: SchedulerEntry, day: DayOfWeek, startMin: number, opts?: { undoable?: boolean }) => Promise<void>>(
    async () => {}
  );

  const moveEntry = useCallback(
    async (entry: SchedulerEntry, day: DayOfWeek, startMin: number, { undoable = true } = {}) => {
      const duration = entry.endMin - entry.startMin;
      const moved = { ...entry, dayOfWeek: day, startMin, endMin: startMin + duration };
      if (moved.dayOfWeek === entry.dayOfWeek && moved.startMin === entry.startMin) return;

      setEntries((prev) => prev.map((e) => (e.id === entry.id ? moved : e)));
      const input = { id: entry.id, dayOfWeek: day, startMin, endMin: moved.endMin };
      setPending((n) => n + 1);
      let res = await moveClassAction(input);
      if (!res.ok && res.overridable && res.violations && (await promptOverride(res.violations))) res = await moveClassAction(input, true);
      setPending((n) => n - 1);
      if (!res.ok) {
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
        toast.error(res.error);
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? res.data : e)));

      const code = maps.subject.get(entry.subjectId)?.code ?? "Class";
      const where = `${DAY_LONG[day]} ${formatTime(startMin)}`;
      const undo = undoable
        ? { label: "Undo", onClick: () => void moveRef.current(res.data, entry.dayOfWeek, entry.startMin, { undoable: false }) }
        : undefined;
      const clashes = conflictsFor(
        res.data,
        entriesRef.current.map((e) => (e.id === entry.id ? res.data : e))
      );
      if (clashes.length) {
        toast.warning(`${code} moved to ${where} — ${clashes.length} conflict${clashes.length > 1 ? "s" : ""}`, {
          description: clashes[0].description,
          action: undo,
        });
      } else {
        toast.success(`${code} moved to ${where}`, { action: undo });
      }
      if (res.data.status !== entry.status) toast.info(`Status changed to ${res.data.status.toLowerCase()} for review.`);
    },
    [maps.subject, conflictsFor, promptOverride]
  );
  useEffect(() => {
    moveRef.current = moveEntry;
  }, [moveEntry]);

  const saveClass = useCallback(
    async (input: ClassInput) => {
      setPending((n) => n + 1);
      let res = await saveClassAction(input);
      if (!res.ok && res.overridable && res.violations && (await promptOverride(res.violations))) res = await saveClassAction(input, true);
      setPending((n) => n - 1);
      if (!res.ok) {
        if (!res.overridable) toast.error(res.error);
        return false;
      }
      setEntries((prev) => {
        const without = prev.filter((e) => e.id !== res.data.id);
        return res.data.status === "ARCHIVED" ? without : [...without, res.data];
      });
      toast.success(input.id ? "Class updated" : "Class added");
      flash(res.data.id);
      return true;
    },
    [flash, promptOverride]
  );

  const deleteClass = useCallback(async (id: string) => {
    const res = await deleteClassAction(id);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast.success("Class deleted");
    return true;
  }, []);

  async function publishVisible() {
    const ids = visibleEntries.filter((e) => e.status === "DRAFT" || e.status === "REVIEW").map((e) => e.id);
    if (!ids.length) return;
    const res = await publishClassesAction(ids);
    if (!res.ok) return void toast.error(res.error);
    const set = new Set(ids);
    setEntries((prev) => prev.map((e) => (set.has(e.id) ? { ...e, status: "PUBLISHED" } : e)));
    toast.success(`Published ${res.data.count} class${res.data.count === 1 ? "" : "es"}`);
  }

  // ---------------------------------------------------------------------------
  // Opening the dialog
  // ---------------------------------------------------------------------------
  const suggest = useCallback(
    (draft: ClassDraft): ClassDraft => {
      const section = maps.section.get(draft.sectionId);
      const subject = maps.subject.get(draft.subjectId);
      const term = maps.term.get(draft.semesterId);
      const concurrent = term
        ? entries.filter((e) => {
            const t = maps.term.get(e.semesterId);
            return t && t.start <= term.end && term.start <= t.end && e.status !== "ARCHIVED";
          })
        : entries;
      const faculty = rankFaculty(data.faculty.filter((f) => f.status === "ACTIVE"), draft, concurrent, section?.level)[0];
      const room = rankRooms(data.rooms.filter((r) => !r.archived), draft, concurrent, {
        studentCount: section?.studentCount,
        component: draft.component,
        requiredRoomType: subject?.requiredRoomType,
        programId: section?.programId,
      })[0];
      return { ...draft, facultyId: draft.facultyId || faculty?.id || "", roomId: draft.roomId || room?.id || "" };
    },
    [maps, entries, data.faculty, data.rooms]
  );

  const openNew = useCallback(
    (patch: Partial<ClassDraft> = {}) => {
      if (!permissions.canEdit) return;
      const sectionId = patch.sectionId ?? (focusedSection?.id || options.sections[0]?.id || "");
      const startMin = patch.startMin ?? 8 * 60;
      const component = patch.component ?? "LECTURE";
      const level = maps.section.get(sectionId)?.level ?? "COLLEGE";
      const draft: ClassDraft = {
        semesterId: termForSection(sectionId),
        sectionId,
        subjectId: "",
        facultyId: filters.facultyId,
        roomId: filters.roomId,
        component,
        dayOfWeek: "MONDAY",
        startMin,
        endMin: startMin + defaultDuration(component, level),
        ...patch,
      };
      setDialog(draft.subjectId ? suggest(draft) : draft);
    },
    [permissions.canEdit, focusedSection, options.sections, maps.section, termForSection, filters.facultyId, filters.roomId, suggest]
  );

  const openNeed = useCallback(
    (need: SubjectNeed, day: DayOfWeek = "MONDAY", startMin = 8 * 60) => {
      const level = maps.section.get(need.sectionId)?.level ?? "COLLEGE";
      const duration = Math.min(defaultDuration(need.component, level), need.requiredMin - need.scheduledMin);
      const start = clampStart(startMin, duration, GRID);
      openNew({
        sectionId: need.sectionId,
        subjectId: need.subjectId,
        component: need.component,
        dayOfWeek: day,
        startMin: start,
        endMin: start + duration,
      });
    },
    [maps.section, openNew]
  );

  const openEntry = useCallback((e: SchedulerEntry) => {
    setDialog({ ...e, notes: e.notes ?? "" });
  }, []);

  const jumpTo = useCallback(
    (entryId: string) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;
      revealEntry(entry);
      setView("timetable");
      setMobilePanelOpen(false);
      flash(entryId);
    },
    [entries, revealEntry, flash]
  );

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: gridKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    })
  );

  function dropTarget(event: DragMoveEvent | DragEndEvent, drag: ActiveDrag): DropPreview | null {
    const over = event.over;
    const day = over?.data.current?.day as DayOfWeek | undefined;
    if (!over || !day) return null;
    const translated = event.active.rect.current.translated;
    const activator = event.activatorEvent as PointerEvent | KeyboardEvent;
    let y: number;
    if (drag.kind === "need" && "clientY" in activator) {
      // Panel items aren't block-shaped, so the pointer marks the start time.
      y = activator.clientY + event.delta.y - over.rect.top - GRID.rowHeight / 2;
    } else if (translated) {
      y = translated.top - over.rect.top;
    } else {
      return null;
    }
    const startMin = clampStart(yToMinutes(y, GRID), drag.duration, GRID);
    return { day, startMin, endMin: startMin + drag.duration };
  }

  function onDragStart(event: DragStartEvent) {
    const d = event.active.data.current as { kind: "entry"; entry: SchedulerEntry } | { kind: "need"; need: SubjectNeed } | undefined;
    if (!d) return;
    if (d.kind === "entry") setActiveDrag({ kind: "entry", entry: d.entry, duration: d.entry.endMin - d.entry.startMin });
    else {
      const level = maps.section.get(d.need.sectionId)?.level ?? "COLLEGE";
      setActiveDrag({
        kind: "need",
        need: d.need,
        duration: Math.min(defaultDuration(d.need.component, level), d.need.requiredMin - d.need.scheduledMin),
      });
    }
  }

  function onDragMove(event: DragMoveEvent) {
    if (!activeDrag) return;
    const target = dropTarget(event, activeDrag);
    setPreview((p) =>
      p?.day === target?.day && p?.startMin === target?.startMin ? p : target
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const drag = activeDrag;
    const target = drag ? dropTarget(event, drag) : null;
    setActiveDrag(null);
    setPreview(null);
    if (!drag || !target) return;
    if (drag.kind === "entry") void moveEntry(drag.entry, target.day, target.startMin);
    else openNeed(drag.need, target.day, target.startMin);
  }

  // ---------------------------------------------------------------------------
  // Shortcuts
  // ---------------------------------------------------------------------------
  useShortcut(
    permissions.canEdit ? { keys: "n", description: "Add a class", group: "Scheduler", handler: () => openNew() } : null
  );
  useShortcut({
    keys: "t",
    description: "Switch timetable / table view",
    group: "Scheduler",
    handler: () => setView((v) => (v === "timetable" ? "table" : "timetable")),
  });
  useShortcut({
    keys: "c",
    description: "Go to the conflicts list",
    group: "Scheduler",
    handler: () => {
      setPanel("conflicts");
      if (window.matchMedia("(min-width: 1024px)").matches) {
        panelRef.current?.querySelector<HTMLElement>("[data-roving], button")?.focus();
      } else setMobilePanelOpen(true);
    },
  });
  useShortcut({
    keys: "f",
    description: "Focus the filters",
    group: "Scheduler",
    handler: () => filterBarRef.current?.querySelector<HTMLElement>("select")?.focus(),
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const days = useMemo(
    () => WEEK_DAYS.filter((d) => d !== "SUNDAY" || visibleEntries.some((e) => e.dayOfWeek === "SUNDAY")),
    [visibleEntries]
  );
  const visibleTimetable = useMemo(() => visibleEntries.filter((e) => e.status !== "ARCHIVED"), [visibleEntries]);
  const pendingPublish = visibleEntries.filter((e) => e.status === "DRAFT" || e.status === "REVIEW").length;

  const focusTitle = focus
    ? focus.kind === "section"
      ? maps.section.get(focus.id)?.name
      : focus.kind === "faculty"
        ? maps.faculty.get(focus.id)?.fullName
        : maps.room.get(focus.id)?.roomName
    : null;

  // Printable timetable of the focused section, teacher, or room.
  const printDoc = useMemo(() => {
    if (!focus || !focusTitle) return null;
    const kind = { section: "Class", faculty: "Teacher", room: "Room" }[focus.kind];
    const termLabels = [...new Set(visibleTimetable.map((e) => maps.term.get(e.semesterId)?.label).filter(Boolean))];
    const term = filters.termId !== ACTIVE_TERMS ? maps.term.get(filters.termId)?.label : termLabels.join("; ");
    const rows = visibleTimetable.map((e) => {
      const r = rowInfo(e);
      return { ...e, subject: `${r.subject} - ${r.subjectName}`, section: r.section, faculty: r.faculty, room: r.room };
    });
    return timetableDoc(`${kind} Timetable: ${focusTitle}`, term || "No term selected", rows, `${kind.toLowerCase()}-timetable-${focusTitle.replace(/\W+/g, "-").toLowerCase()}`);
  }, [focus, focusTitle, visibleTimetable, maps.term, filters.termId, rowInfo]);

  const sidePanel = (
    <div ref={panelRef} className="space-y-3">
      <div role="tablist" aria-label="Scheduler panels" className={cn("grid gap-1 rounded-lg bg-muted p-1", permissions.canEdit ? "grid-cols-3" : "grid-cols-2")}>
        <PanelTab active={panel === "conflicts"} onClick={() => setPanel("conflicts")}>
          Conflicts
          <Badge variant={overlapCount ? "destructive" : "secondary"} className="ml-1">
            {overlapCount}
          </Badge>
        </PanelTab>
        <PanelTab active={panel === "todo"} onClick={() => setPanel("todo")}>
          To schedule
          <Badge variant="secondary" className="ml-1">
            {focusedSection ? needs.length : "–"}
          </Badge>
        </PanelTab>
        {permissions.canEdit && (
          <PanelTab active={panel === "rules"} onClick={() => setPanel("rules")}>
            Constraints
          </PanelTab>
        )}
      </div>
      {panel === "rules" ? (
        <ConstraintReportPanel termId={filters.termId === ACTIVE_TERMS ? "" : filters.termId} onJump={jumpTo} />
      ) : panel === "conflicts" ? (
        <ConflictsPanel conflicts={scopedConflicts} describe={describe} onJump={jumpTo} />
      ) : focusedSection ? (
        <UnscheduledPanel
          needs={needs}
          editable={permissions.canEdit}
          onAdd={(n) => openNeed(n)}
          label={(n) => {
            const s = maps.subject.get(n.subjectId);
            return { title: `${s?.code ?? "?"}${n.component === "LABORATORY" ? " (Lab)" : ""}`, subtitle: s?.name ?? "" };
          }}
        />
      ) : (
        <EmptyState icon={UsersThree} title="Pick a section" description="Choose a section to see which subjects still need a time slot." className="py-8" />
      )}
    </div>
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveDrag(null);
        setPreview(null);
      }}
      accessibility={{
        container: typeof document === "undefined" ? undefined : document.body,
        screenReaderInstructions: {
          draggable:
            "Press Space to pick up this class. Use the arrow keys to move it by 30 minutes or by one day, Space to drop, or Escape to cancel. Press Enter to edit.",
        },
        announcements: {
          onDragStart: () => "Picked up class.",
          onDragOver: () => (preview ? `Over ${DAY_LONG[preview.day]} at ${formatTime(preview.startMin)}.` : undefined),
          onDragEnd: () => (preview ? `Dropped on ${DAY_LONG[preview.day]} at ${formatTime(preview.startMin)}.` : "Dropped."),
          onDragCancel: () => "Move cancelled.",
        },
      }}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-3">
            {permissions.canEdit && <BackButton fallback="/dashboard" dirty={!!dialog || pending > 0} />}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Scheduler</h1>
              <p className="text-sm text-muted-foreground">
                {permissions.canEdit
                  ? "Drag classes to reschedule. Hard constraints block a save; soft ones ask before overriding."
                  : "Weekly timetable. Use the filters to find a section, teacher, or room."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="lg:hidden"
              onClick={() => {
                setPanel("conflicts");
                setMobilePanelOpen(true);
              }}
            >
              <WarningOctagon className="size-4" /> Conflicts
              {overlapCount > 0 && <Badge variant="destructive">{overlapCount}</Badge>}
            </Button>
            <div role="radiogroup" aria-label="View" className="inline-flex rounded-lg border bg-card p-0.5">
              <ViewToggle active={view === "timetable"} onClick={() => setView("timetable")} icon={SquaresFour} label="Timetable" />
              <ViewToggle active={view === "table"} onClick={() => setView("table")} icon={Rows} label="Table" />
            </div>
            {permissions.canPublish && pendingPublish > 0 && (
              <Button variant="outline" onClick={publishVisible}>
                <UploadSimple className="size-4" /> Publish {pendingPublish}
              </Button>
            )}
            {permissions.canEdit && (
              <Button onClick={() => openNew()} aria-keyshortcuts="n">
                <Plus className="size-4" /> Add class
              </Button>
            )}
          </div>
        </div>

        {/* Cascading filters */}
        <Card>
          <CardContent ref={filterBarRef} className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <FilterSelect label="Academic level" value={filters.level} onChange={(v) => update({ level: v as Filters["level"] })} placeholder="All levels" options={options.levels} />
            {options.showDepartment && (
              <FilterSelect label="Department" value={filters.departmentId} onChange={(v) => update({ departmentId: v })} placeholder="All departments" options={options.departments} />
            )}
            {options.showGrade && (
              <FilterSelect label="Grade level" value={filters.gradeLevel} onChange={(v) => update({ gradeLevel: v })} placeholder="All grades" options={options.grades} />
            )}
            {options.showProgram && (
              <FilterSelect
                label={options.programLabel}
                value={filters.programId}
                onChange={(v) => update({ programId: v })}
                placeholder={`All ${options.programLabel.toLowerCase()}s`}
                options={options.programs}
              />
            )}
            {options.showYear && (
              <FilterSelect label="Year level" value={filters.yearLevel} onChange={(v) => update({ yearLevel: v })} placeholder="All years" options={options.years} />
            )}
            <FilterSelect label="Term" value={filters.termId} onChange={(v) => update({ termId: v || ACTIVE_TERMS })} options={options.terms} />
            <FilterSelect label="Section" value={filters.sectionId} onChange={(v) => update({ sectionId: v })} placeholder={`All sections (${options.sections.length})`} options={options.sectionOptions} />
            <FilterSelect label="Faculty" value={filters.facultyId} onChange={(v) => update({ facultyId: v })} placeholder="Any faculty" options={options.faculty} />
            <FilterSelect label="Room" value={filters.roomId} onChange={(v) => update({ roomId: v })} placeholder="Any room" options={options.rooms} />
            {(filters.level || filters.sectionId || filters.facultyId || filters.roomId || filters.termId !== ACTIVE_TERMS) && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  onClick={() =>
                    update({ level: "", termId: ACTIVE_TERMS, sectionId: "", facultyId: "", roomId: "", programId: "", departmentId: "", yearLevel: "", gradeLevel: "" })
                  }
                >
                  <X className="size-4" /> Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label={view === "timetable" ? "Timetable" : "Class list"} className="min-w-0 space-y-3">
            {focusTitle && view === "timetable" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CalendarDots className="size-4 text-primary" />
                <span className="font-semibold">{focusTitle}</span>
                {focusedSection && <span className="text-muted-foreground">· {stageLabel(focusedSection)} · {focusedSection.studentCount} learners</span>}
                <span className="text-muted-foreground">· {visibleTimetable.length} classes</span>
                {printDoc && (
                  <span className="ml-auto">
                    <ReportButtons doc={printDoc} />
                  </span>
                )}
              </div>
            )}

            {view === "table" ? (
              <ScheduleList entries={visibleEntries} info={rowInfo} conflictIndex={conflictIndex} onOpen={openEntry} />
            ) : focus ? (
              visibleTimetable.length === 0 && !permissions.canEdit ? (
                <EmptyState icon={CalendarDots} title="No classes scheduled" description="Nothing is scheduled for this selection yet." />
              ) : (
                <Timetable
                  days={days}
                  entries={visibleTimetable}
                  info={blockInfo}
                  conflictIndex={conflictIndex}
                  editable={permissions.canEdit}
                  highlightId={highlightId}
                  preview={preview}
                  onOpen={openEntry}
                  onEmptySlot={(day, start) => openNew({ dayOfWeek: day, startMin: start, endMin: start + 60 })}
                  grid={GRID}
                />
              )
            ) : (
              <SectionPicker
                sections={options.sections}
                entries={scopeEntries}
                conflictIndex={conflictIndex}
                onPick={(id) => update({ sectionId: id })}
              />
            )}
            {focus && view === "timetable" && permissions.canEdit && (
              <p className="text-xs text-muted-foreground">
                Tip: double-click an empty slot to add a class there · focus a class and press <kbd className="rounded border px-1">Space</kbd> to
                move it with the arrow keys · <kbd className="rounded border px-1">?</kbd> for all shortcuts
              </p>
            )}
          </section>

          <aside aria-label="Conflicts and unscheduled subjects" className="hidden lg:block">
            <div className="sticky top-0 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">{sidePanel}</div>
          </aside>
        </div>
      </div>

      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-sm">
          <SheetHeader className="p-0">
            <SheetTitle>Schedule checks</SheetTitle>
          </SheetHeader>
          {sidePanel}
        </SheetContent>
      </Sheet>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="pointer-events-none w-40 rounded-md border-2 border-primary bg-card px-2 py-1.5 text-xs shadow-lg">
            <p className="font-semibold">
              {maps.subject.get(activeDrag.kind === "entry" ? activeDrag.entry.subjectId : activeDrag.need.subjectId)?.code}
            </p>
            <p className="text-muted-foreground">
              {preview ? `${DAY_LONG[preview.day]} ${formatTime(preview.startMin)}` : "Drop on the timetable"}
            </p>
          </div>
        ) : null}
      </DragOverlay>

      {overrideDialog}

      <ClassDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        draft={dialog}
        data={data}
        entries={entries.filter((e) => e.status !== "ARCHIVED")}
        buildContext={buildContext}
        canPublish={permissions.canPublish}
        directEdit={permissions.directEdit}
        onSave={saveClass}
        onDelete={deleteClass}
      />
    </DndContext>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} options={options} placeholder={placeholder} />
    </Field>
  );
}

function ViewToggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Rows; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

function PanelTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-md text-sm font-medium transition-colors",
        active ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** Card grid shown when no single section/faculty/room is selected. */
function SectionPicker({
  sections,
  entries,
  conflictIndex,
  onPick,
}: {
  sections: SchedulerData["sections"];
  entries: SchedulerEntry[];
  conflictIndex: Map<string, { severity: string }>;
  onPick: (id: string) => void;
}) {
  const { ref: rovingRef, onKeyDown: onRovingKeyDown, onFocus: onRovingFocus } = useRovingFocus({ orientation: "grid" });
  const stats = useMemo(() => {
    const map = new Map<string, { classes: number; conflicts: number }>();
    for (const e of entries) {
      const s = map.get(e.sectionId) ?? { classes: 0, conflicts: 0 };
      s.classes++;
      if (conflictIndex.get(e.id)?.severity === "conflict") s.conflicts++;
      map.set(e.sectionId, s);
    }
    return map;
  }, [entries, conflictIndex]);

  if (sections.length === 0) {
    return <EmptyState icon={FunnelSimple} title="No sections match these filters" description="Try a different level, grade, or program." />;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Choose a section to open its timetable (arrow keys + Enter work too).</p>
      <div ref={rovingRef} onKeyDown={onRovingKeyDown} onFocus={onRovingFocus} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => {
          const st = stats.get(s.id) ?? { classes: 0, conflicts: 0 };
          return (
            <SelectCard
              key={s.id}
              title={s.name}
              subtitle={`${stageLabel(s)} · ${s.studentCount} learners`}
              icon={UsersThree}
              onSelect={() => onPick(s.id)}
              accent={st.conflicts ? "bg-red-500/15 text-red-600" : undefined}
              meta={
                <>
                  <Badge variant="secondary">{st.classes} classes</Badge>
                  {st.conflicts > 0 ? (
                    <Badge variant="destructive">
                      <WarningOctagon weight="fill" /> {st.conflicts} in conflict
                    </Badge>
                  ) : st.classes > 0 ? (
                    <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">
                      <CheckCircle weight="fill" /> No conflicts
                    </Badge>
                  ) : null}
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
