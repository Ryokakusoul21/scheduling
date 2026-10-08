import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { Warning, Tray } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** Page title row with optional description and actions. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {breadcrumb}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: IconCmp = Tray,
  title,
  description,
  action,
  className,
}: {
  icon?: Icon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center",
        className
      )}
    >
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <IconCmp className="size-6" />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Warning className="size-6" />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Generic skeleton for a page made of a header and a grid of cards. */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Uniform card used for selection flows (level → grade → ...). */
export function SelectCard({
  title,
  subtitle,
  meta,
  icon: IconCmp,
  accent,
  selected,
  onSelect,
  href,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  icon?: Icon;
  accent?: string;
  selected?: boolean;
  onSelect?: () => void;
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        {IconCmp && (
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", accent ?? "bg-primary/10 text-primary")}>
            <IconCmp className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          {subtitle && <p className="line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {meta && <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">{meta}</div>}
      {children}
    </>
  );
  const classes = cn(
    "group block w-full rounded-xl border bg-card p-4 text-left shadow-xs transition-all outline-none",
    "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-primary",
    selected && "border-primary ring-2 ring-primary/30",
    className
  );
  if (href) {
    return (
      <Link href={href} data-roving="" tabIndex={-1} className={classes} aria-current={selected ? "true" : undefined}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" data-roving="" tabIndex={-1} onClick={onSelect} className={classes} aria-pressed={selected}>
      {body}
    </button>
  );
}
