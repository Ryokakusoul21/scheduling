"use client";

import { useRovingFocus } from "@/hooks/use-roving-focus";
import { cn } from "@/lib/utils";

/** Responsive grid of cards with arrow-key navigation (cards must carry data-roving). */
export function CardGrid({ className, children, label }: { className?: string; children: React.ReactNode; label?: string }) {
  const { ref, onKeyDown, onFocus } = useRovingFocus({ orientation: "grid" });
  return (
    <div
      ref={ref}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      role="group"
      aria-label={label}
      className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}
    >
      {children}
    </div>
  );
}
