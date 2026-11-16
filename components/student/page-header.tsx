import { GraduationCap } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@/components/ux/states";
import type { StudentPortal } from "@/lib/student/portal";

type Portal = Extract<StudentPortal, { term: string }>;

export function StudentPageHeader({ title, description, portal, actions }: { title: React.ReactNode; description?: string; portal: Portal; actions?: React.ReactNode }) {
  const info = [
    { label: "Section", value: portal.section.name },
    { label: "Program", value: portal.section.program },
    { label: "Year / grade", value: portal.section.stage },
    { label: "Academic term", value: portal.term },
  ].filter((item) => item.value);
  return <header className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-brand-link uppercase">My learning space</p><h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5">
      <GraduationCap aria-hidden className="mt-0.5 hidden size-5 shrink-0 text-brand-link sm:block" />
      <dl className="flex min-w-0 flex-wrap gap-x-7 gap-y-3">{info.map((item) => <div key={item.label} className="min-w-0"><dt className="text-[10px] font-medium text-muted-foreground">{item.label}</dt><dd className="mt-1 text-xs leading-5 font-medium break-words">{item.value}</dd></div>)}</dl>
    </div>
  </header>;
}

export function NoSectionState() {
  return <EmptyState title="Your section is not set yet" description="Contact the Registrar to have your section assigned. Your classes and activities will appear once your enrollment details are ready." />;
}
