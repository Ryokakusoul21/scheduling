import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { CalendarBlank } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

export function StudentPanel({ title, description, action, children, className, id }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("min-w-0 rounded-2xl border border-border/80 bg-card", className)}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
      <div><h2 className="font-heading text-base font-semibold">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}</div>
      {action}
    </header>
    <div className="p-5 sm:p-6">{children}</div>
  </section>;
}

export function StudentEmpty({ title, children, icon: Icon = CalendarBlank }: { title: string; children?: ReactNode; icon?: Icon }) {
  return <div className="flex flex-col items-center px-3 py-8 text-center">
    <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted"><Icon aria-hidden className="size-6 text-muted-foreground" /></span>
    <h3 className="text-sm font-semibold">{title}</h3>
    {children && <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{children}</p>}
  </div>;
}

export const STUDENT_LINK = "inline-flex min-h-10 items-center gap-1.5 rounded-md text-xs font-semibold text-brand-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";
