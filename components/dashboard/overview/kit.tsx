import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Building blocks shared by the dashboard widgets so every card looks and behaves alike. */

export type Tone = "danger" | "warning" | "success" | "info" | "neutral";

// Tinted background with readable text for each status tone.
export const TONE: Record<Tone, string> = {
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  neutral: "bg-muted text-muted-foreground",
};

export const LINK_CLASS = "inline-flex items-center gap-1 rounded-sm text-sm font-medium text-brand-link hover:underline";

/** Dashboard card with a title, optional count, and optional "View all" link on the right. */
export function Section({
  id,
  title,
  count,
  href,
  linkLabel = "View all",
  actions,
  className,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  href?: string;
  linkLabel?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 text-sm text-card-foreground", className)}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={`${id}-title`} className="text-base font-semibold">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>}
        {(actions || href) && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {actions}
            {href && (
              <Link href={href} className={LINK_CLASS}>
                {linkLabel} <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

/** Small inline empty state for lists inside a dashboard card. */
export function QuietState({ icon: IconCmp, title, children }: { icon: Icon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <IconCmp className="size-5" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{title}</p>
        {children && <div className="text-[13px] text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

/** Placeholder card shown while a widget loads. */
export function SectionSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-xl border bg-card p-5", className)} aria-hidden>
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

export interface Kpi {
  label: string;
  value: number;
  hint: string;
  href: string;
  icon: Icon;
  tone: Tone;
}

/** Four clickable stat cards; the tone only shows when there is something to act on. */
export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Key figures">
      {items.map((k) => (
        <li key={k.label}>
          <Link href={k.href} className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors duration-150 hover:border-foreground/25 hover:bg-accent/40 sm:p-5">
            <span className={cn("flex size-9 items-center justify-center rounded-lg", TONE[k.value > 0 ? k.tone : "neutral"])}>
              <k.icon className="size-5" />
            </span>
            <span className="space-y-0.5">
              <span className="block text-2xl font-semibold tabular-nums">{k.value}</span>
              <span className="block text-sm font-medium">{k.label}</span>
              <span className="block text-xs text-muted-foreground">{k.hint}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export interface AttentionItem {
  key: string;
  icon: Icon;
  tone: Tone;
  title: string;
  detail: string;
  count: number;
  href: string;
}

/** Prioritized to-do list: icon, title, one-line description, count, and a Review button. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.key} className="flex items-center gap-3 rounded-lg border p-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONE[a.tone])}>
            <a.icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-medium">
              <span className="truncate">{a.title}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", TONE[a.tone])}>{a.count}</span>
            </span>
            <span className="block truncate text-[13px] text-muted-foreground">{a.detail}</span>
          </span>
          <Link
            href={a.href}
            aria-label={`Review: ${a.title}`}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border px-3 text-sm font-medium transition-colors duration-150 hover:bg-muted"
          >
            Review
          </Link>
        </li>
      ))}
    </ul>
  );
}
