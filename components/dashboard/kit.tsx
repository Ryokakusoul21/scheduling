"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, CircleNotch, Minus } from "@phosphor-icons/react/ssr";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ux/native-select";
import { ExportButtons, PrintHeader } from "@/components/ux/export-buttons";
import { LiveRefresh } from "@/components/ux/live-refresh";
import type { Change } from "@/lib/analytics/trends";
import { cn } from "@/lib/utils";

/** Shared building blocks so the Administrator, Head of Department, and Faculty dashboards look and behave alike. */

export function ChangeBadge({ change, previous }: { change: Change; previous: string | null }) {
  if (change.value === null) return <span className="text-[11px] text-muted-foreground">No data for the previous semester</span>;
  const unit = change.unit === "percent" ? "%" : " points";
  if (change.value === 0) return <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Minus className="size-3" /> No change from {previous}</span>;
  const up = change.value > 0;
  const good = up === change.upIsGood;
  return (
    <span className={cn("flex items-center gap-1 text-[11px] font-medium", good ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {up ? "+" : ""}{change.value}{unit} from {previous}
    </span>
  );
}

export function StatCard({ label, value, hint, change, previous, children }: { label: string; value: React.ReactNode; hint?: React.ReactNode; change?: Change; previous?: string | null; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {change && <ChangeBadge change={change} previous={previous ?? null} />}
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        {children}
      </CardContent>
    </Card>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {title} {pending && <CircleNotch className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
        </h2>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {children}
          {filters.map((f) => (
            <NativeSelect
              key={f.key}
              aria-label={f.label}
              value={f.value}
              onChange={(e) => set(f.key, e.target.value)}
              options={f.allLabel ? [{ value: "", label: f.allLabel }, ...f.options] : f.options}
              className="w-60"
            />
          ))}
          <ExportButtons filename={filename} rows={flat.slice(1)} columns={Array.from({ length: width }, (_, i) => ({ header: String(flat[0]?.[i] ?? ""), value: (r: (string | number | null)[]) => r[i] }))} />
          <LiveRefresh />
        </div>
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
