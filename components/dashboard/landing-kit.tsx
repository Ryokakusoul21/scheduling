import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowsClockwise, BookOpen, Buildings, CalendarCheck, CalendarBlank, ChartBar, ClipboardText, Clock, Gauge, MapPin, UserCheck, Users, WarningCircle } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

export const dashboardLink = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";

const METRIC_ICONS: Record<string, typeof ChartBar> = {
  "Departments": Buildings, "Active faculty": Users, "Staffing attention": WarningCircle,
  "Accounts to review": UserCheck, "Unassigned classes": ClipboardText, "Capacity gaps": Gauge,
  "Class timetables": CalendarBlank, "Examination packages": BookOpen, "Awaiting review": ClipboardText,
  "Ready to publish": CalendarCheck, "Open submission periods": CalendarBlank, "Upcoming periods": Clock,
  "Sections with classes": Users, "Unscheduled components": WarningCircle, "Draft class meetings": ClipboardText,
  "Department requests": ArrowsClockwise, "Published timetables": CalendarCheck, "Revisions needed": ClipboardText,
  "Classes today": CalendarCheck, "Classes remaining": Clock, "Planned teaching load": Gauge,
  "My pending requests": ClipboardText, "My pending bookings": CalendarBlank, "Next 7 days": CalendarBlank,
  "My subjects": BookOpen, "Enrolled subjects": BookOpen, "Weekly class hours": Gauge, "Class changes": ArrowsClockwise,
  "Upcoming activities": CalendarBlank,
};

const ICON_TONES = ["bg-rose-500/10 text-rose-700 dark:text-rose-300", "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", "bg-amber-500/10 text-amber-700 dark:text-amber-300", "bg-teal-500/10 text-teal-700 dark:text-teal-300", "bg-orange-500/10 text-orange-700 dark:text-orange-300", "bg-violet-500/10 text-violet-700 dark:text-violet-300"];

export interface LandingMetric { label: string; value: React.ReactNode; hint?: string; href: string; attention?: boolean }

/** The first dashboard section pairs its summary cards with the campus calendar. */
export function DashboardOverview({ items, activities }: { items: LandingMetric[]; activities: React.ReactNode }) {
  return <div className="@container/overview">
    <div className="grid items-stretch gap-5 @[960px]/overview:grid-cols-[minmax(0,1fr)_minmax(512px,1.15fr)]">
      <LandingMetrics items={items} />
      <div className="min-w-0">{activities}</div>
    </div>
  </div>;
}

export function LandingMetrics({ items }: { items: LandingMetric[] }) {
  const columns = items.length > 4 ? "@2xl/metrics:grid-cols-3" : "";
  return (
    <div className="@container/metrics min-w-0">
    <ul className={cn("grid h-full auto-rows-fr grid-cols-2 gap-4", columns)} aria-label="At a glance">
      {items.map((item, index) => {
        const Icon = METRIC_ICONS[item.label] ?? ChartBar;
        return <li key={item.label} className="min-w-0">
          <Link href={item.href} className="flex h-full min-h-36 flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 outline-none transition-colors hover:border-primary/50 hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
            <div className="flex items-start justify-between gap-2"><p className="text-sm leading-5 font-medium text-muted-foreground">{item.label}</p><span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ICON_TONES[index % ICON_TONES.length])}><Icon className="size-5" aria-hidden /></span></div>
            <p className={cn("text-[32px] leading-9 font-semibold tracking-tight tabular-nums", item.attention && "text-warning")}>{item.value}</p>
            {item.hint ? <p className="mt-auto flex items-start gap-2 text-xs leading-5 text-muted-foreground"><span className="min-w-0 flex-1">{item.hint}</span><ArrowUpRight className="mt-1 size-3.5 shrink-0 opacity-60" aria-hidden /></p> : <ArrowUpRight className="mt-auto size-3.5 shrink-0 self-end opacity-60" aria-hidden />}
          </Link>
        </li>;
      })}
    </ul>
    </div>
  );
}

export function ClassFocus({ eyebrow, title, description, when, location, detail, href, action = "Open my schedule" }: {
  eyebrow: string; title: string; description?: string; when?: string; location?: string; detail?: string; href: string; action?: string;
}) {
  return <section aria-label={eyebrow} className="relative overflow-hidden rounded-[10px] border bg-card p-5 text-card-foreground sm:p-6">
    <div className="relative space-y-4">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">{eyebrow}</p>
      <div><h2 className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
      {(when || location) && <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {when && <p className="flex items-center gap-2"><Clock className="size-4 shrink-0" aria-hidden />{when}</p>}
        {location && <p className="flex items-center gap-2"><MapPin className="size-4 shrink-0" aria-hidden />{location}</p>}
      </div>}
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      <Link href={href} className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium text-[var(--dashboard-accent)] dark:text-[var(--dashboard-tint)] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{action}<ArrowRight className="size-3.5" aria-hidden /></Link>
    </div>
  </section>;
}
