import { cn } from "@/lib/utils";

/** A count with a label; give it onClick and it becomes a filter button. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone?: "amber" | "green" | "red";
  active?: boolean;
  onClick?: () => void;
}) {
  const color = tone === "amber" ? "text-amber-700 dark:text-amber-400" : tone === "green" ? "text-emerald-700 dark:text-emerald-400" : tone === "red" ? "text-red-700 dark:text-red-400" : "text-muted-foreground";
  const body = (
    <span className="flex items-center gap-3">
      {Icon && <Icon className={cn("size-8 shrink-0", color)} aria-hidden />}
      <span>
        <span className="block text-2xl font-semibold tabular-nums">{value}</span>
        <span className="block text-sm text-muted-foreground">{label}</span>
      </span>
    </span>
  );
  const base = "w-full rounded-xl border bg-card p-4 text-left shadow-xs";
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(base, "outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none", active && "border-primary bg-primary/5")}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}
