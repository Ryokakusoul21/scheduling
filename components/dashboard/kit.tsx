"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, BookOpen, Buildings, ChartBar, CircleNotch, DoorOpen, Gauge, Minus, Stack, UserSquare, Users, WarningOctagon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ux/native-select";
import { ExportMenu, PrintHeader } from "@/components/ux/export-buttons";
import { LiveRefresh } from "@/components/ux/live-refresh";
import type { Change } from "@/lib/analytics/trends";
import { cn } from "@/lib/utils";

/** Shared building blocks so the Registrar, Head of Department, and Faculty dashboards look and behave alike. */

export function ChangeBadge({ change, previous }: { change: Change; previous: string | null }) {
  // Without a comparable previous semester nothing is shown; CompareNote explains it once for the whole grid.
  if (change.value === null) return null;
  const unit = change.unit === "percent" ? "%" : " points";
  if (change.value === 0) return <span title={`Same as ${previous}`} className="flex items-center gap-1 text-xs text-muted-foreground"><Minus className="size-3" /> No change</span>;
  const up = change.value > 0;
  const good = up === change.upIsGood;
  return (
    <span title={`${up ? "+" : ""}${change.value}${unit} from ${previous}`} className={cn("flex items-center gap-1 text-xs font-medium", good ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {up ? "+" : ""}{change.value}{unit}
    </span>
  );
}

const TONES = {
  blue: { tile: "bg-blue-500/12 text-blue-600 dark:text-blue-400", bar: "bg-blue-500", edge: "before:bg-blue-500" },
  violet: { tile: "bg-violet-500/12 text-violet-600 dark:text-violet-400", bar: "bg-violet-500", edge: "before:bg-violet-500" },
  emerald: { tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", edge: "before:bg-emerald-500" },
  amber: { tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400", bar: "bg-amber-500", edge: "before:bg-amber-500" },
  rose: { tile: "bg-rose-500/12 text-rose-600 dark:text-rose-400", bar: "bg-rose-500", edge: "before:bg-rose-500" },
  sky: { tile: "bg-sky-500/12 text-sky-600 dark:text-sky-400", bar: "bg-sky-500", edge: "before:bg-sky-500" },
} as const;
type Tone = keyof typeof TONES;

export function StatCard({ label, value, hint, change, previous, icon: CardIcon, progress, tone = "blue", children }: { label: string; value: React.ReactNode; hint?: React.ReactNode; change?: Change; previous?: string | null; icon?: Icon; progress?: number; tone?: Tone; children?: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <Card className={cn("relative overflow-hidden transition-shadow before:absolute before:inset-x-0 before:top-0 before:h-1 hover:shadow-md", t.edge)}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3">
          {CardIcon && <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t.tile)}><CardIcon className="size-5" weight="duotone" aria-hidden /></span>}
          <p className="text-[13px] leading-tight font-medium text-muted-foreground">{label}</p>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("font-bold tracking-tight tabular-nums", typeof value === "string" && value.length > 12 ? "text-xl" : "text-3xl")}>{value}</p>
          {change && <ChangeBadge change={change} previous={previous ?? null} />}
        </div>
        {progress !== undefined && (
          <div role="progressbar" aria-label={label} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        )}
        {hint && <p className="mt-auto border-t pt-2 text-xs text-muted-foreground">{hint}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

const CARD_ICONS: Record<string, Icon> = {
  students: Users, sections: Stack, faculty: UserSquare, subjects: BookOpen, rooms: Buildings,
  roomRate: DoorOpen, facultyRate: Gauge, conflicts: WarningOctagon, loads: ChartBar,
};

const CARD_TONES: Record<string, Tone> = {
  students: "blue", sections: "violet", faculty: "sky", subjects: "emerald", rooms: "amber",
  roomRate: "blue", facultyRate: "emerald", conflicts: "rose", loads: "violet",
};

/** The summary cards of an analytics view, with a single note saying what the changes compare against. */
export function StatCards({ cards, previous }: { cards: { key: string; label: string; value: string; raw: number; change: Change; hint: string }[]; previous: string | null }) {
  const compared = cards.some((c) => c.change.value !== null);
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-muted-foreground">{compared && previous ? `Changes are compared with ${previous}.` : "No earlier semester to compare with yet."}</p>
      <StatGrid>
        {cards.map((c) => (
          <StatCard key={c.key} label={c.label} value={c.value} hint={c.hint} change={c.change} previous={previous} icon={CARD_ICONS[c.key]} tone={CARD_TONES[c.key]} progress={c.key === "roomRate" || c.key === "facultyRate" ? c.raw : undefined} />
        ))}
      </StatGrid>
    </div>
  );
}

export function StatGrid({ children, pending }: { children: React.ReactNode; pending?: boolean }) {
  return <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", pending && "opacity-70")}>{children}</div>;
}

export interface ReportBlock {
  title: string;
  header: string[];
  rows: (string | number | null)[][];
}

type Option = { value: string; label: string };

/**
 * Title row with the filters (kept in the address so the server recomputes), spreadsheet and PDF export
 * of every report block, and the live-update indicator. Use inside a `.print-area` section.
 */
export function DashboardToolbar({
  title,
  printTitle,
  printSubtitle,
  filters,
  blocks,
  filename,
  children,
}: {
  title: string;
  printTitle: string;
  printSubtitle?: string;
  filters: { key: string; label: string; value: string; options: Option[]; allLabel?: string }[];
  blocks: ReportBlock[];
  filename: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  // One spreadsheet with a titled block per table, separated by blank lines.
  const flat = blocks.flatMap((b) => [[b.title], b.header, ...b.rows, []]);
  const width = Math.max(1, ...flat.map((r) => r.length));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {title} {pending && <CircleNotch className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
        </h2>
        <div className="flex items-center gap-2 print:hidden">
          <ExportMenu filename={filename} rows={flat.slice(1)} columns={Array.from({ length: width }, (_, i) => ({ header: String(flat[0]?.[i] ?? ""), value: (r: (string | number | null)[]) => r[i] }))} />
          <LiveRefresh />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {children}
        {filters.map((f) => (
          <NativeSelect
            key={f.key}
            aria-label={f.label}
            value={f.value}
            onChange={(e) => set(f.key, e.target.value)}
            options={f.allLabel ? [{ value: "", label: f.allLabel }, ...f.options] : f.options}
            className="w-full sm:w-64"
          />
        ))}
      </div>
      <PrintHeader title={printTitle} subtitle={printSubtitle} />
    </>
  );
}

/** Turns summary cards into a report block. */
export function cardBlock(title: string, cards: { label: string; value: string; change?: Change }[]): ReportBlock {
  return {
    title,
    header: ["Measure", "Value", "Change from previous semester"],
    rows: cards.map((c) => [c.label, c.value, !c.change || c.change.value === null ? "No data" : `${c.change.value}${c.change.unit === "percent" ? " percent" : " points"}`]),
  };
}
