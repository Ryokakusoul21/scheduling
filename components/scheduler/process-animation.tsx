"use client";

import { useEffect, useState } from "react";
import { Check, CircleNotch } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

// Sample class blocks as [column, row, rows spanned, colour].
const BLOCKS: [number, number, number, string][] = [
  [1, 1, 2, "bg-chart-1"],
  [3, 1, 1, "bg-chart-2"],
  [2, 2, 2, "bg-chart-3"],
  [5, 1, 2, "bg-chart-5"],
  [4, 2, 1, "bg-chart-1"],
  [1, 4, 1, "bg-chart-2"],
  [3, 3, 2, "bg-chart-4"],
  [4, 4, 1, "bg-chart-3"],
  [5, 3, 1, "bg-chart-2"],
];
const CELLS = Array.from({ length: 20 }, (_, i) => i);

/** Process animation: class blocks dropping into a small timetable above a row of stage chips. */
export function ProcessAnimation({ stages, active, label, percent, detail }: {
  stages: string[];
  /** Index of the running stage; omit to advance on a timer when the work reports no progress. */
  active?: number;
  label: string;
  percent?: number;
  detail?: string;
}) {
  const [timed, setTimed] = useState(0);
  useEffect(() => {
    if (active !== undefined) return;
    const id = setInterval(() => setTimed((n) => Math.min(n + 1, stages.length - 1)), 1100);
    return () => clearInterval(id);
  }, [active, stages.length]);
  const current = active ?? timed;

  return (
    <div className="space-y-4 py-4" role="status" aria-label={label}>
      <div aria-hidden className="relative mx-auto grid h-32 w-full max-w-xs grid-cols-5 grid-rows-4 gap-1 overflow-hidden rounded-lg border bg-card p-1.5">
        {CELLS.map((i) => (
          <span key={i} className="rounded-sm bg-muted" style={{ gridColumn: (i % 5) + 1, gridRow: Math.floor(i / 5) + 1 }} />
        ))}
        {BLOCKS.map(([column, row, span, colour], i) => (
          <span
            key={i}
            className={cn("rounded-sm motion-safe:animate-[process-pop_3.6s_ease-out_infinite_both]", colour)}
            style={{ gridColumn: column, gridRow: `${row} / span ${span}`, animationDelay: `${i * 0.25}s` }}
          />
        ))}
        <span className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/5 bg-linear-to-r from-transparent via-primary/25 to-transparent motion-safe:block motion-safe:animate-[process-scan_1.8s_linear_infinite]" />
      </div>

      <ol className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
        {stages.map((stage, i) => (
          <li
            key={stage}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors duration-300",
              i < current && "border-success/40 text-success",
              i === current && "border-primary bg-primary/10 text-primary",
              i > current && "text-muted-foreground"
            )}
          >
            {i < current ? <Check weight="bold" className="size-3.5" /> : i === current ? <CircleNotch className="size-3.5 animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
            {stage}
          </li>
        ))}
      </ol>

      {percent !== undefined && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="text-center text-sm">
        <span className="font-medium">{label}</span>
        {detail && <span className="ml-2 text-muted-foreground">{detail}</span>}
      </p>
    </div>
  );
}
