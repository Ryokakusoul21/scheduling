import { CalendarDots, Exam } from "@phosphor-icons/react/ssr";
import { PageTabs } from "@/components/ux/page-tabs";

export type SchedulerMode = "classes" | "examinations";

/** Switches the Scheduler between class and examination scheduling; the mode lives in the address. */
export function ModeSwitch({ mode, academicYearId }: { mode: SchedulerMode; academicYearId?: string }) {
  const href = (m: SchedulerMode) => `/scheduler?mode=${m}${academicYearId ? `&ay=${academicYearId}` : ""}`;
  return (
    <PageTabs
      label="Scheduler mode"
      className="grid w-full grid-cols-2 self-stretch sm:flex sm:w-auto sm:self-start [&>a]:h-auto [&>a]:min-h-11 [&>a]:min-w-0 [&>a]:justify-center [&>a]:px-2 [&>a]:text-center [&>a]:whitespace-normal sm:[&>a]:px-4"
      tabs={[
        { href: href("classes"), label: "Class Schedule", icon: CalendarDots, active: mode === "classes" },
        { href: href("examinations"), label: "Examination Schedule", icon: Exam, active: mode === "examinations" },
      ]}
    />
  );
}
