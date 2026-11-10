"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePersisted } from "@/hooks/use-persisted";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  CalendarDots,
  CheckCircle,
  FunnelSimple,
  Lightning,
  MagicWand,
  Plus,
  UploadSimple,
  WarningOctagon,
  X,
} from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SectionSheet, printSheets, type SheetSource } from "./schedule-sheet";
import { NativeSelect } from "@/components/ux/native-select";
import { EmptyState } from "@/components/ux/states";
import { ReportButtons } from "@/components/ux/export-buttons";
import { timetableDoc } from "@/lib/export/report";
import { useShortcut } from "@/components/ux/shortcuts";
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
  subjectAppliesToSection,
  yToMinutes,
  type SubjectNeed,
} from "@/lib/scheduler/timetable";
import { rankFaculty, rankRooms } from "@/lib/scheduler/suggest";
import { assignedFor } from "@/lib/subjects/assignment-rules";
import type { DayOfWeek, SchedEntry } from "@/lib/scheduler/types";
import { levelLabel, stageLabel } from "@/lib/academics/levels";
import { SubmitTimetableDialog, type SubmitSummary } from "./submit-timetable-dialog";
import { deleteClassAction, moveClassAction, publishClassesAction, saveClassAction, submitClassesAction, type ClassInput } from "@/app/(dashboard)/scheduler/actions";

import { collision, gridKeyboardCoordinates } from "./dnd-grid";
import { Timetable, PALETTE, type BlockInfo, type DropPreview } from "./timetable";
import { ClassDialog, type ClassDraft } from "./class-dialog";
import { ChecksHeading, ChecksRail, FilterCard, FilterSelect, PanelSection, ScheduleHeader } from "./schedule-chrome";
import { ConflictsPanel, SectionNeedsSummary, UnscheduledPanel, WarningsPanel } from "./side-panels";
import { ResolveIssues, type ResolveRequest } from "./resolve-issues";
import { buildResolverInput } from "@/lib/scheduler/resolver/client-input";
import { applyChanges } from "@/lib/scheduler/resolver/changes";
import { issueFor } from "@/lib/scheduler/resolver/issues";
import type { Change, ResolverEntry } from "@/lib/scheduler/resolver/types";
import { allSectionNeeds, durationMismatches, facultyNotAssigned, sectionNeeds } from "@/lib/scheduler/summary";
import { checkSlot, slotMap, suggestRooms } from "@/lib/scheduler/slot-check";
import { UnscheduledTray } from "./unscheduled-tray";
import { ConstraintReportPanel, useOverridePrompt } from "./constraint-feedback";
import { useWorkloadOverride } from "./workload-override";
import type { RowInfo } from "./schedule-list";
import { ACTIVE_TERMS, useSchedulerFilters, type Filters } from "./use-scheduler-filters";
import type { SchedulerData, SchedulerEntry, SchedulerPermissions } from "./types";

export type ConflictContextBuilder = () => ConflictContext;

type ActiveDrag =
  | { kind: "entry"; entry: SchedulerEntry; duration: number }
  | { kind: "need"; need: SubjectNeed; duration: number; draft: ClassDraft | null };

const GRID = DEFAULT_GRID;

export function SchedulerWorkspace({
  data: initial,
  permissions,
  defaults,
  academicYearControl,
  modes,
}: {
  data: SchedulerData;
  permissions: SchedulerPermissions;
  defaults: Partial<Filters>;
  academicYearControl?: React.ReactNode;
  modes?: React.ReactNode;
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
  const router = useRouter();
  const [submitSummary, setSubmitSummary] = useState<SubmitSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Open side panel sections and the hidden panel are remembered per browser.
  const [openPanels, setOpenPanels] = usePersisted<Partial<Record<PanelKey, boolean>>>("scheduler-panels", {});
  const [panelHidden, setPanelHidden] = usePersisted("scheduler-panel-hidden", false);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [perspective, setPerspective] = useState<"section" | "faculty" | "room">("section");
  // Requests still being saved; together with an open class dialog these count as unsaved changes.
  const [pending, setPending] = useState(0);
  const { prompt: promptOverride, dialog: overrideDialog } = useOverridePrompt();
  const workloadOverride = useWorkloadOverride();
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [dialog, setDialog] = useState<ClassDraft | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [resolveRequest, setResolveRequest] = useState<ResolveRequest | null>(null);
  // Changes of a Resolve issues proposal being previewed on the timetable.
  const [proposed, setProposed] = useState<Change[] | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const togglePanel = (key: PanelKey, current: boolean) => setOpenPanels({ ...openPanels, [key]: !current });
  const toggleHidden = () => setPanelHidden(!panelHidden);
  // Shows the panel, opens one section, and scrolls it into view.
  const setPanel = (key: PanelKey) => {
    setOpenPanels({ ...openPanels, [key]: true });
    setPanelHidden(false);
    requestAnimationFrame(() => panelRef.current?.querySelector(`[data-panel="${key}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------
  const maps = useMemo(
    () => ({
      subject: new Map(data.subjects.map((s) => [s.id, s])),
      section: new Map(data.sections.map((s) => [s.id, s])),
      faculty: new Map(data.faculty.map((f) => [f.id, f])),
      // Display names, including other departments' faculty teaching visible classes.
      facultyName: new Map([...data.faculty.map((f) => [f.id, f.fullName] as const), ...data.outsideFaculty.map((f) => [f.id, `${f.fullName} (${f.department})`] as const)]),
      room: new Map(data.rooms.map((r) => [r.id, r])),
      program: new Map(data.programs.map((p) => [p.id, p])),
      term: new Map(data.terms.map((t) => [t.id, t])),
    }),
    [data.subjects, data.sections, data.faculty, data.outsideFaculty, data.rooms, data.programs, data.terms]
  );

  const colorIndex = useMemo(() => {
    const ids = [...new Set(data.subjects.map((s) => s.id))];
    return new Map(ids.map((id, i) => [id, i % PALETTE.length]));
  }, [data.subjects]);

  const buildContext = useCallback<ConflictContextBuilder>(
    () => ({
      facultyById: new Map(
        data.faculty.map((f) => [f.id, { id: f.id, fullName: f.fullName, maxHours: f.maxHours, dayOff: f.dayOff as DayOfWeek | null, availability: f.availability, assignedHours: 0 }])
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
  const activeFacultyIds = useMemo(
    () => new Set([...data.faculty.filter((f) => f.status !== "ARCHIVED").map((f) => f.id), ...data.outsideFaculty.map((f) => f.id)]),
    [data.faculty, data.outsideFaculty]
  );
  const allConflicts = useMemo(
    () => [
      ...detectConflicts([...entries, ...data.busy].filter((e) => e.status !== "ARCHIVED"), buildContext()),
      ...facultyNotAssigned(entries, activeFacultyIds),
      ...durationMismatches(entries, maps.subject),
    ],
    [entries, data.busy, buildContext, activeFacultyIds, maps.subject]
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
  const warningCount = scopedConflicts.length - overlapCount;

  const contextualIds = useMemo(() => {
    if (!filters.sectionId || (!filters.roomId && !filters.facultyId)) return new Set<string>();
    return new Set(
      visibleEntries
        .filter((e) => (filters.roomId && e.roomId !== filters.roomId) || (filters.facultyId && e.facultyId !== filters.facultyId))
        .map((e) => e.id)
    );
  }, [visibleEntries, filters.sectionId, filters.roomId, filters.facultyId]);

  const ghostEntries = useMemo(() => {
    if (!filters.sectionId) return [];
    return [...scopeEntries, ...data.busy].filter(
      (e) =>
        e.sectionId !== filters.sectionId &&
        ((filters.roomId && e.roomId === filters.roomId) || (filters.facultyId && e.facultyId === filters.facultyId))
    );
  }, [scopeEntries, data.busy, filters.sectionId, filters.roomId, filters.facultyId]);

  const ghostIds = useMemo(() => new Set(ghostEntries.map((e) => e.id)), [ghostEntries]);
  const proposedIds = useMemo(() => new Set((proposed ?? []).flatMap((c) => (c.after ? [c.after.id] : []))), [proposed]);

  // ---------------------------------------------------------------------------
  // Labels
  // ---------------------------------------------------------------------------
  const blockInfo = useCallback(
    (e: SchedulerEntry): BlockInfo => {
      const subject = maps.subject.get(e.subjectId);
      const lines = [
        focus?.kind !== "section" ? maps.section.get(e.sectionId)?.name : null,
        focus?.kind !== "faculty" ? maps.facultyName.get(e.facultyId) : null,
        focus?.kind !== "room" ? maps.room.get(e.roomId)?.roomName : null,
      ].filter(Boolean) as string[];
      return {
        title: e.busy ? "Occupied" : `${subject?.code ?? "?"}${e.component === "LABORATORY" ? " (Laboratory)" : ""}`,
        subtitle: subject?.name ?? "",
        lines,
        colorIndex: colorIndex.get(e.subjectId) ?? 0,
        status: e.status,
        ghost: ghostIds.has(e.id),
        contextual: contextualIds.has(e.id),
        pinned: e.notes?.includes("[PINNED]") ?? false,
        doNotMove: e.doNotMove,
        override: e.notes?.match(/\[OVERRIDE:([^\]]+)\]/)?.[1],
        proposed: proposedIds.has(e.id),
      };
    },
    [maps, colorIndex, focus?.kind, ghostIds, contextualIds, proposedIds]
  );

  const rowInfo = useCallback(
    (e: SchedulerEntry): RowInfo => ({
      // Another department's class is described only as busy.
      subject: e.busy ? "Busy" : (maps.subject.get(e.subjectId)?.code ?? "?"),
      subjectName: e.busy ? "" : (maps.subject.get(e.subjectId)?.name ?? ""),
      section: e.busy ? "a class of another department" : (maps.section.get(e.sectionId)?.name ?? "?"),
      faculty: maps.facultyName.get(e.facultyId) ?? (e.busy ? "Unnamed" : "Not assigned"),
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

  /** Term a section's needs are counted in: its own term, else the one new classes go into. */
  const termOf = useCallback((sectionId: string) => maps.section.get(sectionId)?.semesterId ?? termForSection(sectionId), [maps.section, termForSection]);

  const focusedSection = focus?.kind === "section" ? maps.section.get(focus.id) : undefined;
  const needs = useMemo(
    () => (focusedSection ? sectionNeeds(focusedSection, data.subjects, entries, termOf(focusedSection.id)) : []),
    [focusedSection, data.subjects, entries, termOf]
  );
  // Totals across every section in the current filter, so the panel never shows a placeholder.
  const allNeeds = useMemo(() => allSectionNeeds(options.sections, data.subjects, entries, termOf), [options.sections, data.subjects, entries, termOf]);
  const [ruleCount, setRuleCount] = useState<number | null>(null);
  // Sections that need a look, busiest first, for the "Where to look" helper.
  const conflictSections = useMemo(() => {
    const sectionOf = new Map(scopeEntries.map((e) => [e.id, e.sectionId]));
    const counts = new Map<string, number>();
    for (const c of scopedConflicts.filter(isOverlapConflict)) {
      for (const id of new Set([c.entryA.id, c.entryB?.id].map((x) => (x ? sectionOf.get(x) : undefined)).filter((x): x is string => !!x))) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [scopeEntries, scopedConflicts]);
  const unscheduledSections = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of allNeeds) counts.set(n.sectionId, (counts.get(n.sectionId) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [allNeeds]);
  const issueTotal = (focusedSection ? needs.length : allNeeds.length) + warningCount + overlapCount;


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
      detectConflicts([...list, ...data.busy].filter((e) => e.status !== "ARCHIVED"), buildContext()).filter(
        (c) => isOverlapConflict(c) && (c.entryA.id === entry.id || c.entryB?.id === entry.id)
      ),
    [buildContext, data.busy]
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
      if (entry.status === "PUBLISHED" || entry.status === "REVIEW") {
        toast.info("Open this submitted class to document a reason before changing it.");
        return;
      }

      setEntries((prev) => prev.map((e) => (e.id === entry.id ? moved : e)));
      const input = { id: entry.id, dayOfWeek: day, startMin, endMin: moved.endMin };
      setPending((n) => n + 1);
      let res = await moveClassAction(input);
      if (!res.ok && res.overridable && res.violations && (await promptOverride(res.violations))) res = await moveClassAction(input, true);
      setPending((n) => n - 1);
      if (!res.ok) {
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
        // A move that needs another department's room or faculty member waits for their approval.
        if (res.requested) toast.info("Sent for approval", { description: res.error });
        else toast.error(res.error);
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
        if (res.requested) {
          toast.info("Sent for approval", { description: res.error });
          return true;
        }
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

  const deleteClass = useCallback(async (id: string, reason?: string) => {
    const res = await deleteClassAction(id, reason);
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
  /** Submits the department's whole timetable for the terms with drafts, whatever the filters show. */
  async function submitVisible() {
    const drafts = entries.filter((e) => (e.status === "DRAFT" || e.status === "REVIEW") && !e.busy);
    if (!drafts.length) return;
    const missing = facultyNotAssigned(drafts, activeFacultyIds);
    if (missing.length) {
      setPanel("conflicts");
      return void toast.error(`Assign faculty before submitting: ${missing.length} class${missing.length === 1 ? "" : "es"} without faculty.`, {
        description: missing.slice(0, 5).map((c) => describe(c.entryA)).join("; "),
      });
    }
    // The package: every draft or published class of the department in the terms that have drafts.
    const terms = new Set(drafts.map((e) => e.semesterId));
    const lineup = entries.filter((e) => !e.busy && terms.has(e.semesterId) && (e.status === "DRAFT" || e.status === "REVIEW" || e.status === "PUBLISHED"));
    const sections = [...new Set(lineup.map((e) => e.sectionId))].map((id) => maps.section.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
    const byProgram = Map.groupBy(sections, (x) => (x.programId ? maps.program.get(x.programId)?.code : null) ?? levelLabel(x.level));
    const department = data.departments.find((d) => d.id === sections[0]?.departmentId)?.name ?? "Your department";
    setSubmitSummary({
      department,
      terms: [...terms].map((id) => maps.term.get(id)?.label ?? "this term"),
      programs: [...byProgram].sort(([a], [b]) => a.localeCompare(b)).map(([code, list]) => ({ code, sections: list.length, years: [...new Set(list.map((x) => stageLabel(x)))].sort() })),
      sections: sections.length,
      classes: lineup.length,
      drafts: drafts.length,
    });
  }

  /** Sends the package after the Head of Department confirms in the dialog. */
  async function confirmSubmit() {
    const ids = entries.filter((e) => (e.status === "DRAFT" || e.status === "REVIEW") && !e.busy).map((e) => e.id);
    setSubmitting(true);
    try {
      let res = await submitClassesAction(ids);
      // Unbalanced loads block the submission unless the Head of Department gives a reason.
      if (!res.ok && "imbalance" in res) {
        setSubmitSummary(null);
        const reason = await workloadOverride.prompt(res.imbalance);
        if (!reason) return;
        res = await submitClassesAction(ids, reason);
      }
      if (!res.ok) return void toast.error(res.error);
      const selected = new Set(ids);
      setEntries((prev) => prev.map((e) => (selected.has(e.id) ? { ...e, status: "REVIEW" } : e)));
      setSubmitSummary(null);
      toast.success(`Submitted the whole timetable (${res.data.count} classes) for Registrar approval.`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }
  // Opening the dialog
  // ---------------------------------------------------------------------------
  /** Live classes (own and other departments) in terms running at the same time as the given term. */
  const concurrentWith = useCallback(
    (termId: string) => {
      const term = maps.term.get(termId);
      const all = [...entries, ...data.busy].filter((e) => e.status !== "ARCHIVED");
      if (!term) return all;
      return all.filter((e) => {
        const t = maps.term.get(e.semesterId);
        return t && t.start <= term.end && term.start <= t.end;
      });
    },
    [maps.term, entries, data.busy]
  );

  /** Shared slot validation for drag-and-drop and the unscheduled tray. */
  const slotReasons = useCallback(
    (c: SchedEntry, others: SchedEntry[]) =>
      checkSlot(c, others, { faculty: buildContext().facultyById.get(c.facultyId), room: buildContext().roomById.get(c.roomId), bounds: { startMin: GRID.dayStart, endMin: GRID.dayEnd } }),
    [buildContext]
  );

  const suggest = useCallback(
    (draft: ClassDraft): ClassDraft => {
      const section = maps.section.get(draft.sectionId);
      const subject = maps.subject.get(draft.subjectId);
      const concurrent = concurrentWith(draft.semesterId);
      // Suggestions never pick another department's faculty member or room (that would need approval).
      const pool = data.faculty.filter((f) => f.status === "ACTIVE" && !f.foreign);
      // The subject's assigned professor is the only suggestion when there is one.
      const assigned = assignedFor(data.assignments, draft.subjectId, draft.sectionId);
      const faculty = rankFaculty(pool.some((f) => f.id === assigned) ? pool.filter((f) => f.id === assigned) : pool, draft, concurrent, section?.level)[0];
      const room = rankRooms(data.rooms.filter((r) => !r.archived && !r.foreign), draft, concurrent, {
        studentCount: section?.studentCount,
        component: draft.component,
        requiredRoomType: subject?.requiredRoomType,
        programId: section?.programId,
      })[0];
      return { ...draft, facultyId: draft.facultyId || faculty?.id || "", roomId: draft.roomId || room?.id || "" };
    },
    [maps, concurrentWith, data.faculty, data.rooms, data.assignments]
  );

  /** Free rooms of the right type and size for a class, as panel options. */
  const roomOptions = useCallback(
    (entry: SchedEntry) =>
      suggestRooms(entry, data.rooms, concurrentWith(entry.semesterId ?? ""), {
        studentCount: maps.section.get(entry.sectionId)?.studentCount ?? 0,
        requiredRoomType: maps.subject.get(entry.subjectId)?.requiredRoomType,
      }).map((r) => ({ id: r.id, label: `${r.roomName} · ${r.capacity} seats` })),
    [data.rooms, concurrentWith, maps.section, maps.subject]
  );

  const autoAssignRemaining = useCallback(async () => {
    if (!focusedSection || needs.length === 0) return;
    let placed = 0;
    let working = [...entries];
    for (const need of needs) {
      const duration = Math.min(defaultDuration(need.component, focusedSection.level), need.requiredMin - need.scheduledMin);
      let chosen: ClassDraft | null = null;
      for (const day of WEEK_DAYS.filter((d) => d !== "SUNDAY")) {
        for (let startMin = GRID.dayStart; startMin + duration <= GRID.dayEnd; startMin += GRID.slot) {
          const draft = suggest({ semesterId: termForSection(focusedSection.id), sectionId: focusedSection.id, subjectId: need.subjectId, facultyId: "", roomId: "", component: need.component, dayOfWeek: day, startMin, endMin: startMin + duration });
          if (!draft.facultyId || !draft.roomId) continue;
          const candidate: SchedulerEntry = { ...draft, id: `auto-${need.subjectId}-${day}-${startMin}`, status: "DRAFT", notes: "Generated automatically; review before submitting." };
          const hard = detectConflicts([...working, ...data.busy, candidate], buildContext()).some((c) => isOverlapConflict(c) && (c.entryA.id === candidate.id || c.entryB?.id === candidate.id));
          if (!hard) { chosen = draft; break; }
        }
        if (chosen) break;
      }
      if (!chosen) continue;
      const res = await saveClassAction({ ...chosen, source: "CURRICULUM_QUEUE", notes: "Generated automatically; review before submitting." });
      if (res.ok) { working = [...working, res.data]; placed++; }
    }
    setEntries(working);
    if (placed) toast.success(`${placed} class${placed === 1 ? "" : "es"} added as a draft.`, { description: "Choices favor conflict-free slots, suitable rooms, and available faculty. Review before submitting." });
    if (placed < needs.length) toast.warning(`${needs.length - placed} class${needs.length - placed === 1 ? "" : "es"} could not be placed.`, { description: "Try changing room or faculty availability, then regenerate." });
  }, [focusedSection, needs, entries, data.busy, suggest, termForSection, buildContext]);

  /** Opens Resolve issues for one panel finding, scoped to the sections it involves. */
  const fixIssue = useCallback(
    (c: { type: string; description: string; entryA: SchedEntry; entryB?: SchedEntry }) => {
      const issue = issueFor(c);
      if (!issue) return;
      const sectionIds = [...new Set([c.entryA.sectionId, c.entryB?.sectionId].filter((id): id is string => !!id && !!maps.section.get(id)?.editable))];
      setResolveRequest({ scope: "issue", issueId: issue.id, issueLabel: c.description, sectionIds, kinds: [issue.kind] });
    },
    [maps.section]
  );

  const resolveLabels = useMemo(
    () => ({
      section: (id: string) => maps.section.get(id)?.shortName ?? "Section",
      subject: (id: string) => maps.subject.get(id)?.code ?? "Subject",
      room: (id: string) => maps.room.get(id)?.roomName ?? "Room",
      faculty: (id: string) => maps.facultyName.get(id) ?? "Faculty",
    }),
    [maps]
  );

  /** Mirrors an applied proposal in local state (the server already saved it). */
  const applyResolved = useCallback((changes: Change[]) => {
    setEntries((prev) => {
      const map = new Map(prev.map((e) => [e.id, e]));
      for (const c of changes) {
        if (c.before && !c.after) map.delete(c.before.id);
        if (c.after) map.set(c.after.id, { notes: null, ...map.get(c.after.id), ...c.after } as SchedulerEntry);
      }
      return [...map.values()];
    });
    setProposed(null);
  }, []);

  const undoResolved = useCallback((restored: ResolverEntry[], removedIds: string[]) => {
    setEntries((prev) => {
      const map = new Map(prev.map((e) => [e.id, e]));
      removedIds.forEach((id) => map.delete(id));
      restored.forEach((r) => map.set(r.id, { notes: null, ...map.get(r.id), ...r } as SchedulerEntry));
      return [...map.values()];
    });
  }, []);

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
        source: "CURRICULUM_QUEUE",
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
      const duration = Math.min(defaultDuration(d.need.component, level), d.need.requiredMin - d.need.scheduledMin);
      // Faculty and room are chosen once, so the highlighted slots match what a drop will save.
      const draft = suggest({
        semesterId: termOf(d.need.sectionId), sectionId: d.need.sectionId, subjectId: d.need.subjectId, facultyId: filters.facultyId, roomId: filters.roomId,
        component: d.need.component, dayOfWeek: "MONDAY", startMin: 8 * 60, endMin: 8 * 60 + duration,
      });
      setActiveDrag({ kind: "need", need: d.need, duration, draft: draft.facultyId && draft.roomId ? draft : null });
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
    else if (!drag.draft) openNeed(drag.need, target.day, target.startMin);
    else void placeNeed({ ...drag.draft, dayOfWeek: target.day, startMin: target.startMin, endMin: target.endMin });
  }

  /** Saves a dropped unscheduled class if the slot passes validation, else explains why not. */
  async function placeNeed(draft: ClassDraft) {
    const reasons = slotReasons(draft, concurrentWith(draft.semesterId));
    const code = maps.subject.get(draft.subjectId)?.code ?? "Class";
    if (reasons.length) {
      toast.error(`${code} cannot go on ${DAY_LONG[draft.dayOfWeek]} at ${formatTime(draft.startMin)}`, { description: `${reasons.join(", ")}.` });
      return;
    }
    await saveClass({ ...draft, source: "CURRICULUM_QUEUE", notes: "Placed from the unscheduled tray." });
  }

  async function applyRoom(entryId: string, roomId: string) {
    const e = entries.find((x) => x.id === entryId);
    if (!e) return;
    await saveClass({
      id: e.id, semesterId: e.semesterId, sectionId: e.sectionId, subjectId: e.subjectId, facultyId: e.facultyId, roomId,
      component: e.component, dayOfWeek: e.dayOfWeek, startMin: e.startMin, endMin: e.endMin,
      notes: e.notes || "Room changed to match the laboratory requirement.",
    });
  }

  // ---------------------------------------------------------------------------
  // Shortcuts
  // ---------------------------------------------------------------------------
  useShortcut(
    permissions.canEdit && !permissions.queueOnly ? { keys: "n", description: "Add a class", group: "Scheduler", handler: () => openNew() } : null
  );
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
  const visibleTimetable = useMemo(() => {
    const base = [...visibleEntries, ...ghostEntries].filter((e) => e.status !== "ARCHIVED");
    if (!proposed) return base;
    // Preview: proposed changes drawn in place, limited to the open section, faculty member, or room.
    const inFocus = (e: ResolverEntry) => !focus || (focus.kind === "section" ? e.sectionId === focus.id : focus.kind === "faculty" ? e.facultyId === focus.id : e.roomId === focus.id);
    const ids = new Set(base.map((e) => e.id));
    const relevant = proposed.filter((c) => (c.before && ids.has(c.before.id)) || (c.after && inFocus(c.after)));
    return applyChanges(base, relevant)
      .filter((e) => e.status !== "ARCHIVED")
      .map((e) => ({ notes: null, ...e }) as SchedulerEntry);
  }, [visibleEntries, ghostEntries, proposed, focus]);
  const dragHeatmap = useMemo(() => {
    const result = new Map<DayOfWeek, "valid" | "warning" | "conflict">();
    if (!activeDrag) return result;
    for (const day of WEEK_DAYS.filter((d) => d !== "SUNDAY")) {
      const startMin = preview?.startMin ?? (activeDrag.kind === "entry" ? activeDrag.entry.startMin : 8 * 60);
      let candidate: SchedulerEntry | null = null;
      if (activeDrag.kind === "entry") {
        candidate = { ...activeDrag.entry, dayOfWeek: day, startMin, endMin: startMin + activeDrag.duration };
      } else if (focusedSection) {
        const base = suggest({
          semesterId: termForSection(focusedSection.id), sectionId: focusedSection.id,
          subjectId: activeDrag.need.subjectId, facultyId: filters.facultyId, roomId: filters.roomId,
          component: activeDrag.need.component, dayOfWeek: day, startMin, endMin: startMin + activeDrag.duration,
        });
        if (base.facultyId && base.roomId) candidate = { ...base, id: "drag-preview", status: "DRAFT", notes: null };
      }
      if (!candidate) continue;
      const findings = detectConflicts(
        [...entries.filter((e) => e.id !== candidate!.id), ...data.busy, candidate],
        buildContext()
      ).filter((c) => c.entryA.id === candidate!.id || c.entryB?.id === candidate!.id);
      result.set(day, findings.some(isOverlapConflict) ? "conflict" : findings.length ? "warning" : "valid");
    }
    return result;
  }, [activeDrag, preview?.startMin, focusedSection, suggest, termForSection, filters.facultyId, filters.roomId, entries, data.busy, buildContext]);
  // Valid and invalid slot starts for the class being dragged.
  const dragSlots = useMemo(() => {
    if (!activeDrag) return undefined;
    const base = activeDrag.kind === "entry" ? activeDrag.entry : activeDrag.draft;
    if (!base) return undefined;
    const others = concurrentWith(base.semesterId);
    return slotMap(days.filter((d) => d !== "SUNDAY"), { startMin: GRID.dayStart, endMin: GRID.dayEnd }, GRID.slot, activeDrag.duration, (dayOfWeek, startMin, endMin) =>
      slotReasons({ ...base, id: "id" in base ? base.id : undefined, dayOfWeek, startMin, endMin }, others)
    );
  }, [activeDrag, concurrentWith, days, slotReasons]);
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
      return { ...e, subject: `${r.subject} - ${r.subjectName}`, section: r.section, faculty: r.faculty, room: r.room, units: maps.subject.get(e.subjectId)?.units };
    });
    const section = focus.kind === "section" ? maps.section.get(focus.id) : undefined;
    const program = section?.programId ? maps.program.get(section.programId) : undefined;
    const department = section?.departmentId ? data.departments.find((item) => item.id === section.departmentId)?.name : undefined;
    const details = focus.kind === "section"
      ? { course: program?.name, year: section ? stageLabel(section) : undefined, section: section?.shortName, studentCount: section?.studentCount, department }
      : { focus: focus.kind, focusName: focusTitle };
    return timetableDoc(`${kind} Timetable: ${focusTitle}`, term || "No term selected", rows, `${kind.toLowerCase()}-timetable-${focusTitle.replace(/\W+/g, "-").toLowerCase()}`, details);
  }, [focus, focusTitle, visibleTimetable, maps.term, maps.subject, maps.section, maps.program, filters.termId, rowInfo, data.departments]);

  const unscheduledCount = focusedSection ? needs.length : allNeeds.length;
  const isOpen = (key: PanelKey, count: number | null) => openPanels[key] ?? (count === null ? false : count > 0);
  const sidePanel = (
    <div ref={panelRef} className="space-y-2">
      <ChecksHeading total={issueTotal} conflicts={overlapCount} onHide={toggleHidden} />
      <PanelSection id="conflicts" title="Conflicts" count={overlapCount} tone={overlapCount ? "destructive" : "secondary"} open={isOpen("conflicts", overlapCount)} onToggle={() => togglePanel("conflicts", isOpen("conflicts", overlapCount))}>
        <ConflictsPanel conflicts={scopedConflicts.filter(isOverlapConflict)} describe={describe} onJump={jumpTo} onFix={permissions.canEdit ? fixIssue : undefined} />
      </PanelSection>
      <PanelSection id="todo" title="Unscheduled" count={unscheduledCount} open={isOpen("todo", unscheduledCount)} onToggle={() => togglePanel("todo", isOpen("todo", unscheduledCount))}>
        {focusedSection ? (
          <UnscheduledPanel
            needs={needs}
            editable={permissions.canEdit}
            onAdd={(n) => openNeed(n)}
            onAutoAssign={() => void autoAssignRemaining()}
            label={(n) => {
              const s = maps.subject.get(n.subjectId);
              const preferred = rankFaculty(data.faculty.filter((f) => f.status === "ACTIVE" && !f.foreign), { dayOfWeek: "MONDAY", startMin: 8 * 60, endMin: 9 * 60 }, entries, maps.section.get(n.sectionId)?.level)[0];
              return { title: `${s?.code ?? "?"}${n.component === "LABORATORY" ? " (Laboratory)" : ""}`, subtitle: s?.name ?? "", details: `${s?.lectureHours ?? 0} lecture hours · ${s?.labHours ?? 0} laboratory hours`, preferredFaculty: maps.faculty.get(preferred?.id ?? "")?.fullName };
            }}
          />
        ) : (
          <SectionNeedsSummary
            needs={allNeeds}
            sectionName={(id) => ({ short: maps.section.get(id)?.shortName ?? "Section", full: maps.section.get(id)?.name ?? "Section" })}
            onPick={(id) => update({ sectionId: id })}
          />
        )}
      </PanelSection>
      <PanelSection id="warnings" title="Warnings" count={warningCount} tone={warningCount ? "outline" : "secondary"} open={isOpen("warnings", warningCount)} onToggle={() => togglePanel("warnings", isOpen("warnings", warningCount))}>
        <WarningsPanel
          warnings={scopedConflicts.filter((c) => !isOverlapConflict(c))}
          describe={describe}
          onJump={jumpTo}
          suggestRooms={permissions.canEdit ? roomOptions : undefined}
          onApplyRoom={(id, roomId) => void applyRoom(id, roomId)}
          onFix={permissions.canEdit ? fixIssue : undefined}
          onFixAll={permissions.canEdit ? (kind) => setResolveRequest({ scope: "filter", kinds: [kind] }) : undefined}
        />
      </PanelSection>
      {permissions.canEdit && (
        <PanelSection id="rules" title="Constraints" count={ruleCount} tone={ruleCount ? "outline" : "secondary"} open={isOpen("rules", ruleCount)} onToggle={() => togglePanel("rules", isOpen("rules", ruleCount))}>
          <ConstraintReportPanel termId={filters.termId === ACTIVE_TERMS ? "" : filters.termId} onJump={jumpTo} onCount={setRuleCount} />
        </PanelSection>
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
      <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
        {/* Header */}
        <ScheduleHeader
          trail={
            <nav aria-label="Breadcrumb" className="flex items-center gap-1">
              <Link href="/dashboard" onClick={(e) => { if ((dialog || pending > 0) && !confirm("Leave with unsaved changes?")) e.preventDefault(); }} className="hover:text-foreground">Dashboard</Link> ›
              {focusedSection ? <button type="button" onClick={() => update({ sectionId: "" })} className="hover:text-foreground">Class Schedules</button> : <span>Class Schedules</span>} ›
              {focusedSection && <><span className="font-medium text-foreground">{focusedSection.name}</span> ›</>}
            </nav>
          }
          modes={modes}
          help="Drag classes to reschedule. Hard constraints block a save; soft ones ask before overriding."
          leading={<>
            {academicYearControl}
            <div className="min-w-0 space-y-1 xl:w-64">
              <label htmlFor="scheduler-term" className="block text-sm text-muted-foreground">Term</label>
              <NativeSelect id="scheduler-term" value={filters.termId} onChange={(e) => update({ termId: e.target.value || ACTIVE_TERMS })} options={options.terms} />
            </div>
          </>}
        >
            <Button
              variant="outline"
              className="lg:hidden"
              onClick={() => {
                setPanel("conflicts");
                setMobilePanelOpen(true);
              }}
            >
              <WarningOctagon className="size-4" /> Schedule checks
              {issueTotal > 0 && <Badge variant={overlapCount > 0 ? "destructive" : "secondary"}>{issueTotal}</Badge>}
            </Button>
            {permissions.canPublish && pendingPublish > 0 && (
              <Button variant="outline" onClick={publishVisible}>
                <UploadSimple className="size-4" /> Approve and publish {pendingPublish}
              </Button>
            )}
            {permissions.canSubmit && entries.some((e) => e.status === "DRAFT" && !e.busy) && (
              <Button variant="outline" onClick={submitVisible} title="Sends the whole department timetable: every program, year, and section">
                <UploadSimple className="size-4" /> Submit Timetable for Approval
              </Button>
            )}
            {permissions.canEdit && (
              <Button
                onClick={() => setResolveRequest(focusedSection ? { scope: "selected", sectionIds: [focusedSection.id] } : { scope: "filter" })}
                aria-label={`Resolve issues, ${issueTotal} found`}
              >
                <MagicWand className="size-4" /> Resolve issues
                {issueTotal > 0 && <Badge variant="secondary" className="ml-0.5">{issueTotal}</Badge>}
              </Button>
            )}
            {permissions.canSubmit && <Button variant="outline" onClick={() => focusedSection ? void autoAssignRemaining() : setPanel("todo")}><Lightning className="size-4" /> Auto-Schedule</Button>}
            {permissions.canEdit && !permissions.queueOnly && (
              <Button onClick={() => openNew()} aria-keyshortcuts="n">
                <Plus className="size-4" /> Add class
              </Button>
            )}
        </ScheduleHeader>

        {/* Cascading filters */}
        <FilterCard
          filterRef={filterBarRef}
          expanded={filtersExpanded}
          onToggle={() => setFiltersExpanded((v) => !v)}
          activeCount={Object.entries(filters).filter(([key, value]) => value && !(key === "termId" && value === ACTIVE_TERMS)).length}
          perspective={permissions.queueOnly ? undefined : perspective}
          onPerspective={(kind) => { setPerspective(kind); if (kind !== "section") update({ sectionId: "" }); }}
        >
            {!permissions.lockedLevel && !options.levelFixed && <FilterSelect label="Academic level" value={filters.level} onChange={(v) => update({ level: v as Filters["level"] })} placeholder="All levels" options={options.levels} />}
            {options.showDepartment && !options.departmentFixed && (
              <FilterSelect label="Department" value={filters.departmentId} onChange={(v) => update({ departmentId: v })} placeholder="All departments" options={options.departments} />
            )}
            {options.showGrade && (
              <FilterSelect label="Grade level" value={filters.gradeLevel} onChange={(v) => update({ gradeLevel: v })} placeholder="All grades" options={options.grades} />
            )}
            {options.showProgram && !options.programFixed && (
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
        </FilterCard>

        <div className={cn("grid gap-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden", panelHidden ? "lg:grid-cols-[minmax(0,1fr)_48px]" : "lg:grid-cols-[minmax(0,1fr)_320px]")}>
          <section aria-label="Timetable" className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto pr-1">
            {focusTitle && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CalendarDots className="size-4 text-primary" />
                <span className="font-semibold">{focusTitle}</span>
                {focusedSection && <span className="text-muted-foreground">· {stageLabel(focusedSection)} · {focusedSection.studentCount} learners</span>}
                <span className="text-muted-foreground">· {visibleTimetable.length} classes</span>
                {focusedSection && <Badge variant="secondary">{Math.round(visibleEntries.reduce((sum, e) => sum + e.endMin - e.startMin, 0) / 60 * 10) / 10} / {data.subjects.filter((s) => subjectAppliesToSection(s, focusedSection)).reduce((sum, s) => sum + s.lectureHours + s.labHours, 0)} hours plotted</Badge>}
                {focusedSection && <Badge variant={visibleEntries.some((e) => e.status === "PUBLISHED") ? "outline" : "secondary"}>{visibleEntries.every((e) => e.status === "PUBLISHED") && visibleEntries.length ? "Published" : "Draft"}</Badge>}
                {printDoc && (
                  <span className="ml-auto">
                    <ReportButtons doc={printDoc} />
                  </span>
                )}
              </div>
            )}

            {!focus && (
              <WhereToLook
                conflicts={conflictSections}
                unscheduled={unscheduledSections}
                name={(id) => maps.section.get(id)?.name ?? "Section"}
                onPick={(id) => update({ sectionId: id })}
              />
            )}
            {focus ? (
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
                  heatmap={dragHeatmap}
                  slots={dragSlots}
                  onOpen={openEntry}
                  onEmptySlot={!permissions.canEdit || permissions.queueOnly ? undefined : (day, start) => openNew({ dayOfWeek: day, startMin: start, endMin: start + 60 })}
                  grid={GRID}
                />
              )
            ) : (
              <SectionPicker
                sections={options.sections}
                entries={scopeEntries}
                conflictIndex={conflictIndex}
                subjects={data.subjects}
                data={data}
                termOf={termOf}
                onPick={(id) => update({ sectionId: id })}
                canEdit={permissions.canEdit}
                onResolve={permissions.canEdit ? (id) => setResolveRequest({ scope: "selected", sectionIds: [id] }) : undefined}
              />
            )}
            {focusedSection && (
              <UnscheduledTray
                needs={needs}
                editable={permissions.canEdit}
                onAdd={(n) => openNeed(n)}
                label={(n) => `${maps.subject.get(n.subjectId)?.code ?? "Subject"}${n.component === "LABORATORY" ? " (Laboratory)" : ""}`}
              />
            )}
            {focus && permissions.canEdit && !permissions.queueOnly && (
              <p className="text-xs text-muted-foreground">
                Tip: double-click an empty slot to add a class there · focus a class and press <kbd className="rounded border px-1">Space</kbd> to
                move it with the arrow keys · <kbd className="rounded border px-1">?</kbd> for all shortcuts
              </p>
            )}
          </section>

          <aside aria-label="Conflicts and unscheduled subjects" className="hidden min-h-0 overflow-y-auto lg:block">
            {panelHidden ? (
              <ChecksRail total={issueTotal} conflicts={overlapCount} onShow={toggleHidden} />
            ) : (
              <div className="pr-1">{sidePanel}</div>
            )}
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
      {workloadOverride.dialog}

      {resolveRequest && (
        <ResolveIssues
          key={JSON.stringify(resolveRequest)}
          request={resolveRequest}
          onClose={() => setResolveRequest(null)}
          filterSectionIds={options.sections.filter((s) => s.editable).map((s) => s.id)}
          buildInput={() => buildResolverInput(data, entriesRef.current, termOf)}
          labels={resolveLabels}
          onPreview={setProposed}
          onApplied={applyResolved}
          onUndone={undoResolved}
        />
      )}

      <SubmitTimetableDialog summary={submitSummary} open={!!submitSummary} pending={submitting} onOpenChange={(o) => !o && setSubmitSummary(null)} onConfirm={() => void confirmSubmit()} />
      <ClassDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        draft={dialog}
        data={data}
        entries={[...entries, ...data.busy].filter((e) => e.status !== "ARCHIVED")}
        buildContext={buildContext}
        canPublish={permissions.canPublish}
        directEdit={permissions.directEdit}
        readOnly={!permissions.canEdit}
        onSave={saveClass}
        onDelete={deleteClass}
      />
    </DndContext>
  );
}

type PanelKey = "conflicts" | "todo" | "warnings" | "rules";

/** Schedule sheets shown when no single section, faculty, or room is selected, one tab per program or level. */
function SectionPicker({
  sections,
  entries,
  conflictIndex,
  subjects,
  data,
  termOf,
  onPick,
  canEdit,
  onResolve,
}: {
  sections: SchedulerData["sections"];
  entries: SchedulerEntry[];
  conflictIndex: Map<string, { severity: string }>;
  subjects: SchedulerData["subjects"];
  data: SchedulerData;
  termOf: (sectionId: string) => string;
  onPick: (id: string) => void;
  canEdit: boolean;
  onResolve?: (id: string) => void;
}) {
  const [tab, setTab] = useState<string>("");
  const lookups = useMemo(() => ({
    subjects: new Map(data.subjects.map((x) => [x.id, x])),
    faculty: new Map([
      ...data.faculty.map((x) => [x.id, { fullName: x.fullName }] as const),
      ...data.outsideFaculty.map((x) => [x.id, { fullName: x.fullName, department: x.department }] as const),
    ]),
    rooms: new Map(data.rooms.map((x) => [x.id, x])),
    programs: new Map(data.programs.map((x) => [x.id, x])),
    departments: new Map(data.departments.map((x) => [x.id, x])),
    terms: new Map(data.terms.map((x) => [x.id, x])),
  }), [data]);
  const sourceOf = (section: SchedulerData["sections"][number]): SheetSource => ({
    section,
    entries,
    subjects: lookups.subjects,
    faculty: lookups.faculty,
    rooms: lookups.rooms,
    programName: section.programId ? (lookups.programs.get(section.programId)?.name ?? null) : null,
    departmentName: section.departmentId ? (lookups.departments.get(section.departmentId)?.name ?? null) : null,
    termLabel: lookups.terms.get(termOf(section.id))?.label ?? "",
  });
  const YEARS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"];
  const yearRank = (x: SchedulerData["sections"][number]) => { const i = YEARS.findIndex((y) => (x.yearLevel ?? "").startsWith(y)); return i < 0 ? 9 : i; };
  // A section belongs to its program's tab, or to its level's tab when it has no program.
  const tabOf = (x: SchedulerData["sections"][number]) => x.programId ?? `level:${x.level}`;
  const tabs = useMemo(() => {
    const programs = [...new Set(sections.map((x) => x.programId).filter((x): x is string => !!x))]
      .map((id) => lookups.programs.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((p) => ({ id: p.id, label: p.code, title: p.name }));
    const levels = [...new Set(sections.filter((x) => !x.programId).map((x) => x.level))]
      .map((level) => ({ id: `level:${level}`, label: levelLabel(level), title: levelLabel(level) }));
    return [...programs, ...levels];
  }, [sections, lookups]);
  const active = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? "");
  const stack = sections.filter((x) => tabOf(x) === active).sort((a, b) => yearRank(a) - yearRank(b) || a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));
  const conflicts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) if (conflictIndex.get(e.id)?.severity === "conflict") map.set(e.sectionId, (map.get(e.sectionId) ?? 0) + 1);
    return map;
  }, [entries, conflictIndex]);

  if (sections.length === 0) {
    return <EmptyState icon={FunnelSimple} title="No sections match these filters" description="Try a different level, grade, or program." />;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 print:hidden" role="tablist" aria-label="Schedule sheets">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Schedule sheets:</span>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" title={t.title} aria-selected={active === t.id} onClick={() => setTab(t.id)} className={cn("rounded-full border px-3 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", active === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            {t.label}
          </button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => printSheets(stack.map(sourceOf), "Schedule of classes")}>Print or save as PDF</Button>
      </div>
      <div className="space-y-6 rounded-xl bg-muted/40 p-3">
        {stack.map((s) => {
          const total = s.curriculum.length;
          // Same function as the Unscheduled panel, so the sheet and the panel can never disagree.
          const remaining = sectionNeeds(s, subjects, entries, termOf(s.id)).length;
          const clash = conflicts.get(s.id) ?? 0;
          return (
            <div key={s.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <span className="font-semibold">{s.name}</span>
                <Badge variant="secondary">{total - remaining} / {total} scheduled</Badge>
                {remaining > 0 && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">{remaining} unscheduled</Badge>}
                {clash > 0 ? (
                  <Badge variant="destructive"><WarningOctagon weight="fill" /> {clash} in conflict</Badge>
                ) : total > 0 && remaining === 0 ? (
                  <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400"><CheckCircle weight="fill" /> Complete · No conflicts</Badge>
                ) : null}
                <span className="ml-auto flex gap-2">
                  {onResolve && s.editable && (remaining > 0 || clash > 0) && (
                    <Button size="sm" variant="outline" onClick={() => onResolve(s.id)} aria-label={`Resolve issues in ${s.name}`}><MagicWand className="size-3.5" /> Resolve</Button>
                  )}
                  {canEdit && <Button size="sm" onClick={() => onPick(s.id)}>Open timetable editor</Button>}
                </span>
              </div>
              <SectionSheet source={sourceOf(s)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SHOWN_SECTIONS = 8;

/** Lists the sections with double bookings and with unscheduled subjects, so viewers know where to look first. */
function WhereToLook({ conflicts, unscheduled, name, onPick }: { conflicts: [string, number][]; unscheduled: [string, number][]; name: (id: string) => string; onPick: (id: string) => void }) {
  if (!conflicts.length && !unscheduled.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
        <CheckCircle className="size-5 text-emerald-600" weight="fill" aria-hidden /> Every section is complete with no conflicts.
      </div>
    );
  }
  const group = (title: string, hint: string, rows: [string, number][], tone: string, unit: string) => rows.length > 0 && (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">· {rows.length} section{rows.length === 1 ? "" : "s"} · {hint}</span></p>
      <div className="flex flex-wrap gap-1.5">
        {rows.slice(0, SHOWN_SECTIONS).map(([id, count]) => (
          <button key={id} type="button" onClick={() => onPick(id)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors", tone)}>
            {name(id)} <span className="rounded-full bg-background/80 px-1.5 tabular-nums">{count} {unit}</span>
          </button>
        ))}
        {rows.length > SHOWN_SECTIONS && <span className="self-center text-xs text-muted-foreground">and {rows.length - SHOWN_SECTIONS} more in Schedule checks</span>}
      </div>
    </div>
  );
  return (
    <section aria-label="Where to look" className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
      {group("Conflicts", "double bookings of a room, faculty member, or section", conflicts, "border-red-500/40 bg-red-500/5 text-red-700 hover:bg-red-500/10 dark:text-red-400", "conflicts")}
      {group("Unscheduled subjects", "subjects not yet placed on the timetable", unscheduled, "border-amber-500/40 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400", "left")}
    </section>
  );
}
