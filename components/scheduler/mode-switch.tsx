import Link from "next/link";
import { cn } from "@/lib/utils";

export type SchedulerMode = "classes" | "examinations";

const MODES: { value: SchedulerMode; label: string }[] = [
  { value: "classes", label: "Class Schedule" },
  { value: "examinations", label: "Examination Schedule" },
];

/** Switches the Scheduler between class and examination scheduling; the mode lives in the address. */
export function ModeSwitch({ mode, academicYearId }: { mode: SchedulerMode; academicYearId?: string }) {
  return (
    <nav aria-label="Scheduler mode" className="flex shrink-0 gap-1 rounded-lg bg-muted p-1 self-start">
      {MODES.map((m) => (
        <Link
          key={m.value}
          href={`/scheduler?mode=${m.value}${academicYearId ? `&ay=${academicYearId}` : ""}`}
          aria-current={mode === m.value ? "page" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === m.value ? "bg-background shadow-xs" : "text-muted-foreground hover:bg-background/60")}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}
