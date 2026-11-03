import { CheckCircle, Warning, WarningOctagon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

/** One look for every conflict (hard, red) and warning (soft, amber) in the system. */
export type Severity = "conflict" | "warning";

/** Diagonal hatching laid over a conflicting block or cell so it stands out without hiding its text. */
export const CONFLICT_STRIPES = "repeating-linear-gradient(135deg, rgb(220 38 38 / 0.14) 0 6px, transparent 6px 12px)";

const TONE: Record<Severity, { box: string; text: string; label: string }> = {
  conflict: { box: "border-red-600/40 border-l-red-600 bg-red-600/10", text: "text-red-800 dark:text-red-200", label: "Conflict" },
  warning: { box: "border-amber-500/40 border-l-amber-500 bg-amber-500/10", text: "text-amber-900 dark:text-amber-200", label: "Warning" },
};

/** Small pill that marks an item as a conflict or warning. */
export function ConflictTag({ severity = "conflict", className }: { severity?: Severity; className?: string }) {
  const Icon = severity === "conflict" ? WarningOctagon : Warning;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-semibold text-white", severity === "conflict" ? "bg-red-600" : "bg-amber-600", className)}>
      <Icon className="size-3" weight="fill" aria-hidden />
      {TONE[severity].label}
    </span>
  );
}

/** Alert card: coloured left edge, title, then each reason on its own line (or any children). */
export function ConflictAlert({ severity = "conflict", title, items, children, className }: { severity?: Severity; title?: React.ReactNode; items?: React.ReactNode[]; children?: React.ReactNode; className?: string }) {
  const tone = TONE[severity];
  const Icon = severity === "conflict" ? WarningOctagon : Warning;
  return (
    <div role={severity === "conflict" ? "alert" : "note"} className={cn("rounded-lg border border-l-4 p-3 text-sm", tone.box, tone.text, className)}>
      <p className="flex items-start gap-2 font-semibold">
        <Icon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
        <span className="min-w-0">{title ?? children}</span>
      </p>
      {items && items.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-9 font-normal">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      {title && children && <div className="mt-1 pl-6 font-normal">{children}</div>}
    </div>
  );
}

/** Positive counterpart shown when a check finds nothing. */
export function NoConflict({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-l-4 border-emerald-600/30 border-l-emerald-600 bg-emerald-600/10 p-2.5 text-sm text-emerald-800 dark:text-emerald-200">
      <CheckCircle className="size-4 shrink-0" weight="fill" aria-hidden /> {children}
    </p>
  );
}
