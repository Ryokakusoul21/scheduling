import { cn } from "@/lib/utils";

export type SummaryCard = { key: string; label: string; value: number | string; active?: boolean; tone?: "warn"; onClick?: () => void };

/** Totals at the top of the list; the clickable ones filter the table. */
export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Summary">
      {cards.map((c) => {
        const body = (
          <>
            <span className={cn("block text-2xl font-semibold tabular-nums", c.tone === "warn" && Number(c.value) > 0 && "text-amber-700 dark:text-amber-400")}>{c.value}</span>
            <span className="block text-sm text-muted-foreground">{c.label}</span>
          </>
        );
        return (
          <li key={c.key}>
            {c.onClick ? (
              <button type="button" onClick={c.onClick} aria-pressed={c.active} className={cn("w-full rounded-xl border bg-card p-3 text-left shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60", c.active && "border-primary bg-primary/5")}>{body}</button>
            ) : (
              <div className="rounded-xl border bg-card p-3 shadow-xs">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
