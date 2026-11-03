"use client";

import { useDraggable } from "@dnd-kit/core";
import { DotsSixVertical } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import type { SubjectNeed } from "@/lib/scheduler/timetable";

/** Chips of a section's unscheduled classes shown under the timetable; drag one onto the grid to place it. */
export function UnscheduledTray({
  needs,
  label,
  editable,
  onAdd,
}: {
  needs: SubjectNeed[];
  label: (n: SubjectNeed) => string;
  editable: boolean;
  onAdd: (n: SubjectNeed) => void;
}) {
  if (!needs.length) return null;
  return (
    <section aria-label="Unscheduled classes" className="rounded-lg border bg-card p-2">
      <h3 className="mb-1.5 text-sm font-semibold">
        Unscheduled ({needs.length})
        {editable && <span className="ml-2 text-xs font-normal text-muted-foreground">Drag onto the timetable: green slots are valid, red slots show why not.</span>}
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {needs.map((n) => (
          <TrayChip key={`${n.sectionId}:${n.subjectId}:${n.component}`} need={n} text={label(n)} editable={editable} onAdd={onAdd} />
        ))}
      </ul>
    </section>
  );
}

function TrayChip({ need, text, editable, onAdd }: { need: SubjectNeed; text: string; editable: boolean; onAdd: (n: SubjectNeed) => void }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `tray:${need.sectionId}:${need.subjectId}:${need.component}`,
    disabled: !editable,
    data: { kind: "need", need },
  });
  const hours = `${Math.round((need.scheduledMin / 60) * 10) / 10} of ${need.requiredMin / 60} hours`;
  return (
    <li>
      <button
        type="button"
        ref={setNodeRef}
        {...listeners}
        disabled={!editable}
        onClick={() => onAdd(need)}
        aria-label={`${text}, ${hours} scheduled. Press Enter to add.`}
        className={cn(
          "inline-flex touch-none items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50",
          editable && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50"
        )}
      >
        {editable && <DotsSixVertical className="size-3.5 text-muted-foreground" weight="bold" aria-hidden />}
        {text}
        <span className="text-muted-foreground">· {hours}</span>
      </button>
    </li>
  );
}
