import { CalendarStar, Confetti, Exam, Prohibit } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { ACTIVITY_TYPES } from "@/lib/student/format";

// Each type has an icon as well as a color, so the badge never relies on color alone.
const STYLES: Record<string, { className: string; icon: typeof Confetti }> = {
  HOLIDAY: { className: "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", icon: Confetti },
  CLASS_SUSPENSION: { className: "border-red-600/30 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300", icon: Prohibit },
  EXAMINATION_WEEK: { className: "border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300", icon: Exam },
  SCHOOL_EVENT: { className: "border-blue-600/30 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300", icon: CalendarStar },
};

/** Humanized, colored activity type label such as "Examination week". */
export function ActivityTypeBadge({ type, className }: { type: string; className?: string }) {
  const style = STYLES[type] ?? STYLES.SCHOOL_EVENT;
  const Icon = style.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", style.className, className)}>
      <Icon className="size-3.5" aria-hidden />
      {ACTIVITY_TYPES[type] ?? type}
    </span>
  );
}
