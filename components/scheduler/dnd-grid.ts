import { closestCenter, pointerWithin, type CollisionDetection, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { DEFAULT_GRID, type GridConfig } from "@/lib/scheduler/timetable";

/** Prefer the pointer's column; fall back to the nearest column for keyboard drags. */
export const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

/** Keyboard dragging moves one slot vertically and one day horizontally per key press. */
export const gridKeyboardCoordinatesFor = (grid: GridConfig): KeyboardCoordinateGetter => (event, { context, currentCoordinates }) => {
  const colWidth = [...context.droppableRects.values()][0]?.width ?? 120;
  const steps: Record<string, [number, number]> = {
    ArrowDown: [0, grid.rowHeight * (grid.snapStep ?? grid.slot) / grid.slot],
    ArrowUp: [0, -grid.rowHeight * (grid.snapStep ?? grid.slot) / grid.slot],
    ArrowRight: [colWidth, 0],
    ArrowLeft: [-colWidth, 0],
  };
  const step = steps[event.code];
  if (!step) return undefined;
  event.preventDefault();
  return { x: currentCoordinates.x + step[0], y: currentCoordinates.y + step[1] };
};
export const gridKeyboardCoordinates = gridKeyboardCoordinatesFor(DEFAULT_GRID);
