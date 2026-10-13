import { CheckCircle, Warning } from "@phosphor-icons/react/ssr";
import type { LoadRow } from "@/lib/workload/optimizer";
import { cn } from "@/lib/utils";

export const LOAD_STATUS = {
  OVERLOADED: { label: "Overloaded", icon: Warning, text: "text-red-700 dark:text-red-400", bar: "bg-red-500" },
  UNDERLOADED: { label: "Underloaded", icon: Warning, text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500" },
  BALANCED: { label: "Balanced", icon: CheckCircle, text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-600" },
} as const;

/** Load as a bar against the allowed band (shaded from minimum to maximum), colored by status. */
export function LoadBar({ r, className }: { r: Pick<LoadRow, "load" | "minimum" | "maximum" | "status">; className?: string }) {
  const scale = Math.max(r.maximum * 1.25, r.load, 1);
  const pct = (n: number) => `${Math.min((n / scale) * 100, 100)}%`;
  return (
    <div className={cn("relative h-2.5 w-full rounded-full bg-muted", className)} aria-hidden>
      <div className="absolute inset-y-0 rounded-full bg-emerald-500/20" style={{ left: pct(r.minimum), width: `calc(${pct(r.maximum)} - ${pct(r.minimum)})` }} />
      <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", LOAD_STATUS[r.status].bar)} style={{ width: pct(r.load) }} />
    </div>
  );
}

/** Status text with an icon, so the state never depends on color alone. */
export function LoadStatusLabel({ status }: { status: LoadRow["status"] }) {
  const s = LOAD_STATUS[status];
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", s.text)}>
      <s.icon className="size-3.5" /> {s.label}
    </span>
  );
}
