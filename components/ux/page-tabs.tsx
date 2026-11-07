import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface PageTab {
  href: string;
  label: string;
  icon: Icon;
  active?: boolean;
  badge?: number;
}

/** Prominent page-level tabs: larger targets, icons, and a filled active tab. */
export function PageTabs({ label, tabs }: { label: string; tabs: PageTab[] }) {
  return (
    <nav aria-label={label} className="flex max-w-full shrink-0 gap-1 self-start overflow-x-auto rounded-xl border bg-card p-1 shadow-xs">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            t.active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <t.icon className="size-4.5" weight={t.active ? "fill" : "regular"} />
          {t.label}
          {!!t.badge && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
