"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Arrow-key navigation for lists, tables and card grids (roving tabindex).
 *
 * Mark each navigable item with `data-roving` (use `rovingItemProps`). Only one
 * item is in the Tab order at a time; arrows move focus, Home/End jump, and
 * Enter "clicks" the focused item. In "grid" mode, Up/Down move by row based on
 * the rendered layout, so responsive card grids just work.
 */
export function useRovingFocus<T extends HTMLElement = HTMLDivElement>({
  orientation = "vertical",
}: { orientation?: "vertical" | "grid" } = {}) {
  const ref = useRef<T>(null);

  const items = useCallback(
    () => (ref.current ? [...ref.current.querySelectorAll<HTMLElement>("[data-roving]")] : []),
    []
  );

  // Keep exactly one item tabbable.
  useEffect(() => {
    const all = items();
    if (all.length === 0) return;
    if (!all.some((el) => el.tabIndex === 0)) all[0].tabIndex = 0;
  });

  const focusItem = useCallback(
    (target: HTMLElement) => {
      for (const el of items()) el.tabIndex = el === target ? 0 : -1;
      target.focus();
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [items]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const all = items();
      const current = (e.target as HTMLElement).closest<HTMLElement>("[data-roving]");
      if (!current || all.length === 0) return;
      const index = all.indexOf(current);
      // Only handle keys pressed on the item itself, not on buttons/inputs inside it.
      const onItem = e.target === current;

      let next: number | null = null;
      if (orientation === "grid") {
        const top = all[0].offsetTop;
        const cols = Math.max(1, all.filter((el) => el.offsetTop === top).length);
        if (e.key === "ArrowRight") next = index + 1;
        if (e.key === "ArrowLeft") next = index - 1;
        if (e.key === "ArrowDown") next = index + cols;
        if (e.key === "ArrowUp") next = index - cols;
      } else {
        if (e.key === "ArrowDown") next = index + 1;
        if (e.key === "ArrowUp") next = index - 1;
      }
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = all.length - 1;

      if (next !== null && onItem) {
        e.preventDefault();
        focusItem(all[Math.min(Math.max(next, 0), all.length - 1)]);
        return;
      }
      if (e.key === "Enter" && onItem) {
        e.preventDefault();
        current.click();
      }
    },
    [items, orientation, focusItem]
  );

  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>("[data-roving]");
      if (item) for (const el of items()) el.tabIndex = el === item ? 0 : -1;
    },
    [items]
  );

  return { ref, onKeyDown, onFocus };
}

/** Props for a navigable item. */
export const rovingItemProps = { "data-roving": "", tabIndex: -1 } as const;
