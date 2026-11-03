import { cn } from "@/lib/utils";
import { loadTone, type LoadTone } from "@/lib/subjects/plan";

const FILL: Record<LoadTone, string> = { ok: "bg-emerald-600", warn: "bg-amber-500", full: "bg-red-600" };
const TEXT: Record<LoadTone, string> = { ok: "text-emerald-700 dark:text-emerald-400", warn: "text-amber-700 dark:text-amber-400", full: "text-red-700 dark:text-red-400" };
const WORD: Record<LoadTone, string> = { ok: "Available", warn: "Near the limit", full: "At or over the limit" };

/** Workload against the limit: green under 75%, amber to the limit, red at or over it; `after` previews a change as "19 → 22 / 24 hrs". */
export function FacultyLoadBar({ load, limit, after, unit = "hrs", className }: { load: number; limit: number; after?: number; unit?: string; className?: string }) {
  const shown = after ?? load;
  const tone = loadTone(shown, limit);
  const pct = limit > 0 ? Math.min(100, Math.round((shown / limit) * 100)) : 100;
  return (
    <div className={cn("space-y-1", className)}>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={shown} aria-label={`Workload ${shown} of ${limit} ${unit}. ${WORD[tone]}.`} className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div className={cn("h-full rounded-full transition-[width] motion-reduce:transition-none", FILL[tone])} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn("text-xs font-medium tabular-nums", TEXT[tone])}>
        {after !== undefined && after !== load ? `${load} → ${after}` : shown} / {limit} {unit}
      </p>
    </div>
  );
}
