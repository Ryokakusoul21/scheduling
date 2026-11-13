"use client";

import type { ReactNode } from "react";
import { Rows, SquaresFour } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePersisted } from "@/hooks/use-persisted";
import { DragHandle, SortableList, type SortableRenderProps } from "./sortable-list";

export type CollectionLayout = "cards" | "table";

export function useCollectionView(key: string, fallback: CollectionLayout = "cards") {
  const [saved, setView] = usePersisted<CollectionLayout>(key, fallback);
  return [saved === "cards" || saved === "table" ? saved : fallback, setView] as const;
}

export function ViewSwitch({ value, onChange, label = "View" }: {
  value: CollectionLayout; onChange: (value: CollectionLayout) => void; label?: string;
}) {
  return <div role="group" aria-label={label} className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5 print:hidden">
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

export interface RecordViewRow { id: string; label?: string; cells: ReactNode[]; draggable?: boolean }

/** A horizontally scrollable semantic table, including optional keyboard/mouse reordering. */
export function RecordsTable({ label, columns, rows, onReorder }: {
  label: string; columns: string[]; rows: RecordViewRow[]; onReorder?: (ids: string[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const renderRow = (row: RecordViewRow, props?: SortableRenderProps) => <TableRow key={row.id} ref={props?.setNodeRef} style={props?.style} className={props?.isDragging ? "bg-card shadow-lg" : undefined}>
    {onReorder && <TableCell>{props && row.draggable !== false && <DragHandle {...props.handleProps} />}</TableCell>}
    {row.cells.map((cell, i) => <TableCell key={i} className="max-w-lg align-top whitespace-normal">{cell}</TableCell>)}
  </TableRow>;
  return <div className="min-w-0 overflow-hidden rounded-xl border bg-card"><Table aria-label={label} className="min-w-[640px]">
    <TableHeader><TableRow>{onReorder && <TableHead><span className="sr-only">Reorder</span></TableHead>}{columns.map((column) => <TableHead key={column} scope="col">{column}</TableHead>)}</TableRow></TableHeader>
    {onReorder ? <SortableList items={rows} getLabel={(row) => row.label ?? row.id} onReorder={onReorder} renderItem={renderRow}>{(items) => <TableBody>{items}</TableBody>}</SortableList> : <TableBody>{rows.map((row) => renderRow(row))}</TableBody>}
  </Table></div>;
}
