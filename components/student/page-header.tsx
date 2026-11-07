import { EmptyState } from "@/components/ux/states";
import type { StudentPortal } from "@/lib/student/portal";

type Portal = Extract<StudentPortal, { term: string }>;

/** Page title with the student's section, program, year level, term, and student number as a labeled info row. */
export function StudentPageHeader({ title, portal, actions }: { title: React.ReactNode; portal: Portal; actions?: React.ReactNode }) {
  const info = [
    { label: "Section", value: portal.section.name },
    { label: "Program", value: portal.section.program },
    { label: "Year level", value: portal.section.stage },
    { label: "Term", value: portal.term },
    { label: "Student number", value: portal.studentNumber },
  ].filter((i) => i.value);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 shadow-xs sm:grid-cols-3 lg:grid-cols-5">
        {info.map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{i.label}</dt>
            <dd className="truncate text-sm font-medium" title={i.value ?? undefined}>{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Shown on every portal page while the student has no section on file. */
export function NoSectionState() {
  return <EmptyState title="No section on file" description="Your section was removed or is not set. Ask the Registrar to assign your section." />;
}
