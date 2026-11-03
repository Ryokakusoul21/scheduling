"use client";

import Link from "next/link";
import { MagnifyingGlass, SlidersHorizontal, X } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSelect } from "@/components/ux/native-select";
import { STATUS_FILTERS, STATUS_LABELS, type StatusFilter } from "@/lib/subjects/status";

export type FilterChip = { key: string; label: string; onRemove: () => void };

export const SORTS = [
  { value: "code", label: "Sort: Code" },
  { value: "title", label: "Sort: Title" },
  { value: "units", label: "Sort: Units" },
  { value: "hours", label: "Sort: Hours" },
  { value: "unassigned", label: "Sort: Unassigned first" },
] as const;

const CATEGORIES = [{ value: "ALL", label: "All categories" }, { value: "MAJOR", label: "Major" }, { value: "MINOR", label: "Minor / General Education" }, { value: "JOINED", label: "Shared by programs" }];

/** One toolbar: search, term, category, status and sort; everything else sits under Filters with removable chips. */
export function SubjectsToolbar(props: {
  query: string; onQuery: (v: string) => void;
  terms: { value: string; label: string }[]; termId: string | null; onTerm: (v: string) => void;
  category: string; onCategory: (v: string) => void;
  status: StatusFilter; onStatus: (v: StatusFilter) => void;
  sort: string; onSort: (v: string) => void;
  mineOnly: boolean; onMineOnly: (v: boolean) => void;
  allSemesters: boolean; onAllSemesters: (v: boolean) => void;
  otherLevelsHref: string;
  chips: FilterChip[]; onClear: () => void;
  trailing?: React.ReactNode;
}) {
  const extra = Number(props.mineOnly) + Number(props.allSemesters);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search by subject code or title</span>
          <MagnifyingGlass className="absolute left-2.5 top-3 size-4 text-muted-foreground" aria-hidden />
          <Input value={props.query} onChange={(e) => props.onQuery(e.target.value)} placeholder="Search code or title" className="h-10 pl-8 md:text-sm" />
        </label>
        {props.termId && <NativeSelect aria-label="Term" value={props.termId} onChange={(e) => props.onTerm(e.target.value)} options={props.terms} className="[&_select]:h-10" />}
        <NativeSelect aria-label="Category" value={props.category} onChange={(e) => props.onCategory(e.target.value)} options={CATEGORIES} className="[&_select]:h-10" />
        <NativeSelect aria-label="Status" value={props.status} onChange={(e) => props.onStatus(e.target.value as StatusFilter)} options={STATUS_FILTERS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} className="[&_select]:h-10" />
        <NativeSelect aria-label="Sort" value={props.sort} onChange={(e) => props.onSort(e.target.value)} options={SORTS.map((s) => ({ ...s }))} className="[&_select]:h-10" />
        <Popover>
          <PopoverTrigger render={<Button variant="outline" className="h-10" />}>
            <SlidersHorizontal className="size-4" /> Filters {extra > 0 && <Badge className="ml-1">{extra}</Badge>}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3 p-4">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={props.mineOnly} onChange={(e) => props.onMineOnly(e.target.checked)} className="mt-0.5 size-4 accent-primary" /> <span><span className="font-medium">My department only</span><span className="block text-muted-foreground">Hide General Education and other departments&apos; subjects.</span></span></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={props.allSemesters} onChange={(e) => props.onAllSemesters(e.target.checked)} className="mt-0.5 size-4 accent-primary" /> <span><span className="font-medium">Every semester</span><span className="block text-muted-foreground">Otherwise only subjects offered in the selected term show.</span></span></label>
            <Link href={props.otherLevelsHref} className="block rounded text-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">Browse other levels and departments (read-only)</Link>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex items-center gap-2">{props.trailing}</div>
      </div>
      {props.chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {props.chips.map((c) => (
            <button key={c.key} type="button" onClick={c.onRemove} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
              {c.label} <X className="size-3.5" aria-label="Remove filter" />
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={props.onClear}>Clear all</Button>
        </div>
      )}
    </div>
  );
}
