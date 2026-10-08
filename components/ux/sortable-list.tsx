"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Announcements,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

export interface SortableRenderProps {
  setNodeRef: (el: HTMLElement | null) => void;
  style: React.CSSProperties;
  isDragging: boolean;
  /** Spread onto the drag handle (see <DragHandle>). */
  handleProps: React.HTMLAttributes<HTMLElement> & { ref: (el: HTMLElement | null) => void };
}

/**
 * Drag-to-reorder list. Works with the mouse/touch (drag the handle) and the
 * keyboard (focus the handle, Space to pick up, arrows to move, Space to drop,
 * Esc to cancel). The new order is applied optimistically and rolled back if
 * `onReorder` fails.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  getLabel,
  layout = "list",
  disabled = false,
  children,
}: {
  items: T[];
  onReorder: (ids: string[]) => Promise<{ ok: boolean; error?: string }>;
  renderItem: (item: T, props: SortableRenderProps) => React.ReactNode;
  getLabel: (item: T) => string;
  layout?: "list" | "grid";
  disabled?: boolean;
  /** Optional wrapper (e.g. <tbody>) — receives the rendered items. */
  children?: (rendered: React.ReactNode) => React.ReactNode;
}) {
  const [order, setOrder] = useState(items);
  const [synced, setSynced] = useState(items);
  const [, startTransition] = useTransition();
  // Re-sync when the server sends a new list (after create/delete/revalidate).
  if (items !== synced) {
    setSynced(items);
    setOrder(items);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    })
  );

  const labelOf = (id: string | number) => {
    const item = order.find((i) => i.id === id);
    return item ? getLabel(item) : "item";
  };
  const position = (id: string | number) => order.findIndex((i) => i.id === id) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}. Position ${position(active.id)} of ${order.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `${labelOf(active.id)} moved to position ${position(over.id)} of ${order.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${labelOf(active.id)} dropped at position ${position(over.id)} of ${order.length}.` : `${labelOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(order, order.findIndex((i) => i.id === active.id), order.findIndex((i) => i.id === over.id));
    setOrder(next);
    startTransition(async () => {
      const res = await onReorder(next.map((i) => i.id));
      if (!res.ok) {
        setOrder(previous);
        toast.error(res.error ?? "Could not save the new order.");
      }
    });
  }

  const rendered = order.map((item) => (
    <SortableItem key={item.id} id={item.id} disabled={disabled} label={getLabel(item)}>
      {(props) => renderItem(item, props)}
    </SortableItem>
  ));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "To reorder, press Space to pick up. Use the arrow keys to move, Space to drop, or Escape to cancel.",
        },
      }}
    >
      <SortableContext items={order.map((i) => i.id)} strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}>
        {children ? children(rendered) : rendered}
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  disabled,
  label,
  children,
}: {
  id: string;
  disabled: boolean;
  label: string;
  children: (props: SortableRenderProps) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return children({
    setNodeRef,
    isDragging,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      position: "relative",
      zIndex: isDragging ? 20 : undefined,
    },
    handleProps: {
      ...attributes,
      ...listeners,
      ref: setActivatorNodeRef,
      "aria-label": `Reorder ${label}`,
    } as SortableRenderProps["handleProps"],
  });
}

export function DragHandle({ className, ...props }: SortableRenderProps["handleProps"] & { className?: string }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none",
        "hover:bg-muted hover:text-foreground active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      <DotsSixVertical className="size-4" weight="bold" />
    </button>
  );
}
