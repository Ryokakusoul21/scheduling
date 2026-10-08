"use client";

import { useDraggable } from "@dnd-kit/core";
import { CheckCircle, DotsSixVertical, Plus, WarningOctagon, Warning } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { isOverlapConflict } from "@/lib/scheduler/conflictDetector";
import type { DetectedConflict, SchedEntry } from "@/lib/scheduler/types";
import type { SubjectNeed } from "@/lib/scheduler/timetable";
import { EmptyState } from "@/components/ux/states";

const TYPE_LABEL: Record<string, string> = {
  FACULTY_CONFLICT: "Faculty double-booked",
  ROOM_CONFLICT: "Room double-booked",
  SECTION_CONFLICT: "Section overlap",
  CAPACITY_CONFLICT: "Over capacity",
  AVAILABILITY_CONFLICT: "Faculty unavailable",
  SUBJECT_REQUIREMENT_CONFLICT: "Room type mismatch",
};

export function ConflictsPanel({
  conflicts,
  describe,
  onJump,
}: {
  conflicts: DetectedConflict[];
  describe: (e: SchedEntry) => string;
  onJump: (entryId: string) => void;
}) {
  const { ref: rovingRef, onKeyDown: onRovingKeyDown, onFocus: onRovingFocus } = useRovingFocus<HTMLUListElement>();
  const overlaps = conflicts.filter(isOverlapConflict);
  const warnings = conflicts.filter((c) => !isOverlapConflict(c));

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

  const item = (c: DetectedConflict, i: number, severe: boolean) => (
    <li key={`${c.type}-${c.entryA.id}-${c.entryB?.id ?? i}`}>
      <button
        type="button"
        data-roving=""
        tabIndex={-1}
        onClick={() => c.entryA.id && onJump(c.entryA.id)}
        className={cn(
          "w-full rounded-lg border p-2.5 text-left text-sm outline-none transition-colors",
          severe
            ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/10"
            : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
        )}
      >
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", severe ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300")}>
          {severe ? <WarningOctagon className="size-4" weight="fill" /> : <Warning className="size-4" weight="fill" />}
          {TYPE_LABEL[c.type] ?? c.type}
        </span>
        <span className="mt-1 block text-xs">{describe(c.entryA)}</span>
        {c.entryB && <span className="block text-xs text-muted-foreground">vs. {describe(c.entryB)}</span>}
        <span className="mt-1 block text-[11px] text-muted-foreground">{c.description}</span>
      </button>
      {c.entryB?.id && (
        <button
          type="button"
          onClick={() => onJump(c.entryB!.id!)}
          className="mt-0.5 ml-2.5 text-[11px] font-medium text-primary hover:underline"
        >
          Show the other class
        </button>
      )}
    </li>
  );

  return (
    <ul ref={rovingRef} onKeyDown={onRovingKeyDown} onFocus={onRovingFocus} aria-label="Schedule conflicts" className="space-y-2">
      {overlaps.map((c, i) => item(c, i, true))}
      {warnings.length > 0 && (
        <li className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Warnings ({warnings.length})</li>
      )}
      {warnings.map((c, i) => item(c, i, false))}
    </ul>
  );
}

export const needDraggableId = (n: SubjectNeed) => `need:${n.sectionId}:${n.subjectId}:${n.component}`;

export function UnscheduledPanel({
  needs,
  label,
  editable,
  onAdd,
}: {
  needs: SubjectNeed[];
  label: (n: SubjectNeed) => { title: string; subtitle: string };
  editable: boolean;
  onAdd: (n: SubjectNeed) => void;
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
  label: { title: string; subtitle: string };
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
