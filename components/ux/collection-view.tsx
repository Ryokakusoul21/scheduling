"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Rows, SquaresFour } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePersisted } from "@/hooks/use-persisted";

export type CollectionLayout = "cards" | "table";

const PHONE = "(max-width: 639px)";

/** True on phone-width screens; false during server render. */
function usePhone() {
  return useSyncExternalStore(
    (notify) => { const m = window.matchMedia(PHONE); m.addEventListener("change", notify); return () => m.removeEventListener("change", notify); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

/** Saved layout per list; phones always get cards because wide tables do not fit. */
export function useCollectionView(key: string, fallback: CollectionLayout = "cards") {
  const [saved, setView] = usePersisted<CollectionLayout>(key, fallback);
  const phone = usePhone();
  return [phone ? "cards" : saved === "cards" || saved === "table" ? saved : fallback, setView] as const;
}

export function ViewSwitch({ value, onChange, label = "View" }: {
  value: CollectionLayout; onChange: (value: CollectionLayout) => void; label?: string;
}) {
  return <div role="group" aria-label={label} className="hidden shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5 sm:inline-flex print:hidden">
    {([ ["cards", SquaresFour, "Cards"], ["table", Rows, "Table"] ] as const).map(([mode, Icon, text]) =>
      <Button key={mode} type="button" variant={value === mode ? "default" : "ghost"} size="lg" aria-label={`${text} view`} aria-pressed={value === mode} onClick={() => onChange(mode)}><Icon aria-hidden className="size-4" />{text}</Button>)}
  </div>;
}

/** Both layouts use the caller's same filtered records and permission-checked actions. */
export function CollectionView({ storageKey, label, table, children, defaultView = "cards" }: {
  storageKey: string; label: string; table: ReactNode; children: ReactNode; defaultView?: CollectionLayout;
}) {
  const [view, setView] = useCollectionView(storageKey, defaultView);
  return <div className="min-w-0 space-y-3">
    <div className="flex justify-end"><ViewSwitch value={view} onChange={setView} label={`${label} view`} /></div>
    {view === "table" ? table : children}
  </div>;
}

export interface RecordViewRow { id: string; label?: string; cells: ReactNode[] }

/** A horizontally scrollable semantic table. */
export function RecordsTable({ label, columns, rows }: {
  label: string; columns: string[]; rows: RecordViewRow[];
}) {
  const renderRow = (row: RecordViewRow) => <TableRow key={row.id}>
    {row.cells.map((cell, i) => <TableCell key={i} className="max-w-lg align-top whitespace-normal">{cell}</TableCell>)}
  </TableRow>;
  return <div className="min-w-0 overflow-hidden rounded-xl border bg-card"><Table aria-label={label} className="min-w-[640px]">
    <TableHeader><TableRow>{columns.map((column) => <TableHead key={column} scope="col">{column}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.map(renderRow)}</TableBody>
  </Table></div>;
}
