"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Rows, SquaresFour } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePersisted } from "@/hooks/use-persisted";
import { cn } from "@/lib/utils";

export type CollectionLayout = "cards" | "table";

const PHONE = "(max-width: 767px)";

/** True on phone-width screens; false during server render. */
function usePhone() {
  return useSyncExternalStore(
    (notify) => { const m = window.matchMedia(PHONE); m.addEventListener("change", notify); return () => m.removeEventListener("change", notify); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

/** Saved layout per list; phones always get cards because wide tables do not fit. */
export function useCollectionView(key: string, fallback: CollectionLayout = "cards", allowMobileTable = false) {
  const [saved, setView] = usePersisted<CollectionLayout>(key, fallback);
  const [mobile, setMobileView] = usePersisted<CollectionLayout>(`${key}:mobile`, "cards");
  const phone = usePhone();
  const value = phone ? allowMobileTable ? mobile : "cards" : saved;
  return [value === "cards" || value === "table" ? value : fallback, phone ? setMobileView : setView] as const;
}

export function ViewSwitch({ value, onChange, label = "View", mobile = false }: {
  value: CollectionLayout; onChange: (value: CollectionLayout) => void; label?: string; mobile?: boolean;
}) {
  return <div role="group" aria-label={label} className={cn("hidden shrink-0 items-center gap-0.5 rounded-xl border bg-card p-0.5 md:inline-flex print:hidden", mobile && "inline-flex")}>
    {([ ["cards", SquaresFour, "Cards"], ["table", Rows, "Table"] ] as const).map(([mode, Icon, text]) =>
      <Button key={mode} type="button" variant={value === mode ? "default" : "ghost"} size="lg" className="min-h-11 px-3 md:min-h-0" aria-label={`${text} view`} aria-pressed={value === mode} onClick={() => onChange(mode)}><Icon aria-hidden className="size-4" />{text}</Button>)}
  </div>;
}

/** Both layouts use the caller's same filtered records and permission-checked actions. */
export function CollectionView({ storageKey, label, table, mobileTable, children, defaultView = "cards" }: {
  storageKey: string; label: string; table: ReactNode; mobileTable?: ReactNode; children: ReactNode; defaultView?: CollectionLayout;
}) {
  const [view, setView] = useCollectionView(storageKey, defaultView, !!mobileTable);
  return <div className="min-w-0 space-y-3">
    <div className={cn("hidden justify-end md:flex", mobileTable && "flex")}><ViewSwitch value={view} onChange={setView} label={`${label} view`} mobile={!!mobileTable} /></div>
    {view === "table" ? mobileTable ? <><div className="md:hidden">{mobileTable}</div><div className="hidden md:block">{table}</div></> : table : children}
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
