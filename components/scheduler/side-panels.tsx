"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CheckCircle, DotsSixVertical, MagicWand, Plus, WarningOctagon, Warning } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import type { DetectedConflict, SchedEntry } from "@/lib/scheduler/types";
import type { SubjectNeed } from "@/lib/scheduler/timetable";
import { EmptyState } from "@/components/ux/states";
import { issueFor } from "@/lib/scheduler/resolver/issues";
import type { IssueKind } from "@/lib/scheduler/resolver/types";

const TYPE_LABEL: Record<string, string> = {
  FACULTY_CONFLICT: "Faculty double-booked",
  ROOM_CONFLICT: "Room double-booked",
  SECTION_CONFLICT: "Section overlap",
  CAPACITY_CONFLICT: "Over capacity",
  AVAILABILITY_CONFLICT: "Faculty unavailable",
  DAY_OFF_CONFLICT: "Faculty day off",
  DAILY_HOURS_CONFLICT: "Over 8 hours in a day",
  SUBJECT_REQUIREMENT_CONFLICT: "Room type mismatch",
  FACULTY_NOT_ASSIGNED: "Faculty not assigned",
  DURATION_MISMATCH: "Hours do not match subject",
};

type Fix = (c: DetectedConflict) => void;

/** One finding: what clashes, the classes involved, and quick actions. */
function FindingItem({
  c,
  severe,
  describe,
  onJump,
  onFix,
  extra,
}: {
  c: DetectedConflict;
  severe: boolean;
  describe: (e: SchedEntry) => string;
  onJump: (entryId: string) => void;
  onFix?: Fix;
  extra?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        data-roving=""
        tabIndex={-1}
        onClick={() => c.entryA.id && onJump(c.entryA.id)}
        className={cn(
          "w-full rounded-lg border p-2.5 text-left text-sm outline-none transition-colors",
          severe ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/10" : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
        )}
      >
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", severe ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300")}>
          {severe ? <WarningOctagon className="size-4" weight="fill" /> : <Warning className="size-4" weight="fill" />}
          {TYPE_LABEL[c.type] ?? c.type}
        </span>
        <span className="mt-1 block text-xs">{describe(c.entryA)}</span>
        {c.entryB && <span className="block text-xs text-muted-foreground">vs. {describe(c.entryB)}</span>}
        <span className="mt-1 block text-xs text-muted-foreground">{c.description}</span>
      </button>
      <div className="mt-0.5 ml-2.5 flex flex-wrap items-center gap-x-3">
        {c.entryB?.id && (
          <button type="button" onClick={() => onJump(c.entryB!.id!)} className="text-xs font-medium text-primary hover:underline">
            Show the other class
          </button>
        )}
        {onFix && issueFor(c) && (
          <button type="button" onClick={() => onFix(c)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <MagicWand className="size-3.5" /> Fix
          </button>
        )}
      </div>
      {extra}
    </li>
  );
}

/** Double bookings, each with a Fix action that runs Resolve issues for just that clash. */
export function ConflictsPanel({
  conflicts,
  describe,
  onJump,
  onFix,
}: {
  conflicts: DetectedConflict[];
  describe: (e: SchedEntry) => string;
  onJump: (entryId: string) => void;
  onFix?: Fix;
}) {
  const { ref: rovingRef, onKeyDown: onRovingKeyDown, onFocus: onRovingFocus } = useRovingFocus<HTMLUListElement>();
  if (conflicts.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="No conflicts"
        description="No room, faculty, or section overlaps in the current view."
        className="border-emerald-500/30 bg-emerald-500/5 py-8"
      />
    );
  }
  return (
    <ul ref={rovingRef} onKeyDown={onRovingKeyDown} onFocus={onRovingFocus} aria-label="Schedule conflicts" className="space-y-2">
      {conflicts.map((c, i) => (
        <FindingItem key={`${c.type}-${c.entryA.id}-${c.entryB?.id ?? i}`} c={c} severe describe={describe} onJump={onJump} onFix={onFix} />
      ))}
    </ul>
  );
}

/** Warnings grouped by type with a count, "Fix all of this type" where the resolver handles it, and a Fix per item. */
export function WarningsPanel({
  warnings,
  describe,
  onJump,
  suggestRooms,
  onApplyRoom,
  onFix,
  onFixAll,
}: {
  warnings: DetectedConflict[];
  describe: (e: SchedEntry) => string;
  onJump: (entryId: string) => void;
  /** Free rooms of the right type for a room type mismatch. */
  suggestRooms?: (entry: SchedEntry) => { id: string; label: string }[];
  onApplyRoom?: (entryId: string, roomId: string) => void;
  onFix?: Fix;
  onFixAll?: (kind: IssueKind) => void;
}) {
  const { ref: rovingRef, onKeyDown: onRovingKeyDown, onFocus: onRovingFocus } = useRovingFocus<HTMLDivElement>();
  if (warnings.length === 0) {
    return <EmptyState icon={CheckCircle} title="No warnings" description="Rooms, hours, and availability all check out in the current view." className="py-8" />;
  }
  const groups = new Map<string, DetectedConflict[]>();
  for (const w of warnings) groups.set(w.type, [...(groups.get(w.type) ?? []), w]);
  return (
    <div ref={rovingRef} onKeyDown={onRovingKeyDown} onFocus={onRovingFocus} className="space-y-4">
      {[...groups].sort((a, b) => b[1].length - a[1].length).map(([type, list]) => {
        const kind = issueFor(list[0])?.kind;
        return (
          <section key={type} aria-label={`${TYPE_LABEL[type] ?? type}: ${list.length}`} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {TYPE_LABEL[type] ?? type} ({list.length})
              </h3>
              {onFixAll && kind && (
                <button type="button" onClick={() => onFixAll(kind)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <MagicWand className="size-3.5" /> Fix all of this type
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {list.map((c, i) => (
                <FindingItem
                  key={`${c.type}-${c.entryA.id}-${i}`}
                  c={c}
                  severe={false}
                  describe={describe}
                  onJump={onJump}
                  onFix={onFix}
                  extra={c.type === "SUBJECT_REQUIREMENT_CONFLICT" && c.entryA.id && suggestRooms && onApplyRoom ? <RoomSuggestions entryId={c.entryA.id} rooms={() => suggestRooms(c.entryA)} onApply={onApplyRoom} /> : undefined}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export const needDraggableId = (n: SubjectNeed) => `need:${n.sectionId}:${n.subjectId}:${n.component}`;

export function UnscheduledPanel({
  needs,
  label,
  editable,
  onAdd,
  onAutoAssign,
}: {
  needs: SubjectNeed[];
  label: (n: SubjectNeed) => { title: string; subtitle: string; details?: string; preferredFaculty?: string };
  editable: boolean;
  onAdd: (n: SubjectNeed) => void;
  onAutoAssign?: () => void;
}) {
  const { ref: rovingRef, onKeyDown: onRovingKeyDown, onFocus: onRovingFocus } = useRovingFocus<HTMLUListElement>();
  if (needs.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Everything is scheduled"
        description="All subjects for this section have their weekly hours placed."
        className="py-8"
      />
    );
  }
  return (
    <div className="space-y-2">
      {editable && onAutoAssign && <button type="button" onClick={onAutoAssign} className="inline-flex w-full items-center justify-center rounded-md border bg-card px-3 py-2 text-xs font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">Auto-Assign Remaining</button>}
      {editable && (
        <p className="text-xs text-muted-foreground">
          Drag a subject onto the timetable, or focus it and press <kbd className="rounded border px-1">Enter</kbd> to add it.
        </p>
      )}
      <ul ref={rovingRef} onKeyDown={onRovingKeyDown} onFocus={onRovingFocus} aria-label="Subjects to schedule" className="space-y-1.5">
        {needs.map((n) => (
          <NeedItem key={needDraggableId(n)} need={n} label={label(n)} editable={editable} onAdd={onAdd} />
        ))}
      </ul>
    </div>
  );
}

function NeedItem({
  need,
  label,
  editable,
  onAdd,
}: {
  need: SubjectNeed;
  label: { title: string; subtitle: string; details?: string; preferredFaculty?: string };
  editable: boolean;
  onAdd: (n: SubjectNeed) => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: needDraggableId(need),
    disabled: !editable,
    data: { kind: "need", need },
  });
  const pct = Math.round((need.scheduledMin / need.requiredMin) * 100);
  return (
    <li>
      <button
        type="button"
        ref={setNodeRef}
        {...listeners}
        // Keyboard users add via Enter (opens the dialog) rather than dragging.
        onKeyDown={undefined}
        data-roving=""
        tabIndex={-1}
        disabled={!editable}
        onClick={() => onAdd(need)}
        className={cn(
          "flex w-full touch-none items-center gap-2 rounded-lg border bg-card p-2 text-left text-sm outline-none transition-colors hover:border-primary/40",
          editable && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50"
        )}
        aria-label={`${label.title}, ${label.subtitle}. ${Math.round(need.scheduledMin / 60 * 10) / 10} of ${need.requiredMin / 60} hours scheduled. Press Enter to add.`}
      >
        {editable && <DotsSixVertical className="size-4 shrink-0 text-muted-foreground" weight="bold" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{label.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{label.subtitle}</span>
          {label.details && <span className="mt-0.5 block text-[11px] text-muted-foreground">{label.details}</span>}
          {label.preferredFaculty && <span className="block truncate text-[11px] text-muted-foreground">Preferred faculty: {label.preferredFaculty}</span>}
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {Math.round((need.scheduledMin / 60) * 10) / 10}/{need.requiredMin / 60}h
        </span>
        {editable && <Plus className="size-4 shrink-0 text-primary" />}
      </button>
    </li>
  );
}

/** Unscheduled totals per section when no single section is open; picking one opens its timetable. */
export function SectionNeedsSummary({
  needs,
  sectionName,
  onPick,
}: {
  needs: SubjectNeed[];
  sectionName: (id: string) => { short: string; full: string };
  onPick: (sectionId: string) => void;
}) {
  const { ref: rovingRef, onKeyDown: onRovingKeyDown, onFocus: onRovingFocus } = useRovingFocus<HTMLUListElement>();
  if (needs.length === 0) {
    return <EmptyState icon={CheckCircle} title="Everything is scheduled" description="Every section in the current filter has its weekly hours placed." className="py-8" />;
  }
  const counts = new Map<string, number>();
  for (const n of needs) counts.set(n.sectionId, (counts.get(n.sectionId) ?? 0) + 1);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {needs.length} unscheduled across {counts.size} section{counts.size === 1 ? "" : "s"}. Choose a section to place them.
      </p>
      <ul ref={rovingRef} onKeyDown={onRovingKeyDown} onFocus={onRovingFocus} aria-label="Sections with unscheduled subjects" className="space-y-1.5">
        {[...counts].sort((a, b) => b[1] - a[1] || sectionName(a[0]).short.localeCompare(sectionName(b[0]).short)).map(([id, count]) => (
          <li key={id}>
            <button
              type="button"
              data-roving=""
              tabIndex={-1}
              onClick={() => onPick(id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card p-2 text-left text-sm outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="truncate font-medium" title={sectionName(id).full}>{sectionName(id).short}</span>
              <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">{count} unscheduled</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Suggest rooms" action under a room type mismatch; applying a room saves the class with it. */
function RoomSuggestions({ entryId, rooms, onApply }: { entryId: string; rooms: () => { id: string; label: string }[]; onApply: (entryId: string, roomId: string) => void }) {
  const [list, setList] = useState<{ id: string; label: string }[] | null>(null);
  if (!list) {
    return (
      <button type="button" onClick={() => setList(rooms())} className="mt-0.5 ml-2.5 text-xs font-medium text-primary hover:underline">
        Suggest rooms
      </button>
    );
  }
  if (!list.length) return <p className="mt-1 ml-2.5 text-xs text-muted-foreground">No free room of the right type and size at this time.</p>;
  return (
    <ul aria-label="Suggested rooms" className="mt-1 ml-2.5 space-y-1">
      {list.slice(0, 5).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{r.label}</span>
          <button type="button" onClick={() => onApply(entryId, r.id)} className="shrink-0 rounded border px-2 py-0.5 font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            Use room
          </button>
        </li>
      ))}
    </ul>
  );
}
