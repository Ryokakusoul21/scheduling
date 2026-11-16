"use client";

import { useMemo, useState, useTransition } from "react";
import { Archive, ArrowCounterClockwise, ArrowUpRight, BookOpen, CircleNotch, Door, GraduationCap, MagnifyingGlass, ShieldCheck, SquaresFour, Users, X } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NativeSelect } from "@/components/ux/native-select";
import { Pagination, usePagination } from "@/components/ux/pagination";
import { EmptyState } from "@/components/ux/states";
import { restoreRecordAction } from "@/actions/archive";
import { ARCHIVE_KINDS, ARCHIVE_LABELS, type ArchiveKind } from "@/lib/archive/kinds";
import type { ArchivedRow } from "@/lib/archive/list";
import { cn } from "@/lib/utils";

const categories = {
  USER: { label: "Accounts", icon: Users, color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  FACULTY: { label: "Faculty", icon: GraduationCap, color: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  SUBJECT: { label: "Subjects", icon: BookOpen, color: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  ROOM: { label: "Rooms", icon: Door, color: "bg-teal-500/10 text-teal-700 dark:text-teal-300" },
  SECTION: { label: "Sections", icon: SquaresFour, color: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};

function archiveDate(iso: string, time = false) {
  return new Date(iso).toLocaleString("en-PH", {
    ...(time ? { hour: "numeric", minute: "2-digit" } : { dateStyle: "medium" }),
    timeZone: "Asia/Taipei",
  });
}

/** Account emails and faculty IDs get their own line instead of widening the register. */
function recordName(row: ArchivedRow) {
  const parts = (row.kind === "USER" || row.kind === "FACULTY") && row.name.match(/^(.*) \(([^()]*)\)$/);
  return parts ? { title: parts[1], subtitle: parts[2] } : { title: row.name, subtitle: "" };
}

export function ArchivedList({ rows }: { rows: ArchivedRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ArchiveKind | "">("");
  const [department, setDepartment] = useState("");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<ArchivedRow | null>(null);
  const [restoring, setRestoring] = useState("");
  const [pending, startTransition] = useTransition();

  const departments = useMemo(() => [...new Set(rows.map((r) => r.department))].sort(), [rows]);
  const counts = useMemo(() => Object.fromEntries(ARCHIVE_KINDS.map((k) => [k, rows.filter((r) => r.kind === k).length])), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!department || r.department === department) &&
        (!q || [r.name, r.detail, r.department, r.reason, r.archivedBy].some((v) => v.toLowerCase().includes(q))),
    ).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.archivedAt.localeCompare(b.archivedAt) : b.archivedAt.localeCompare(a.archivedAt));
  }, [rows, query, kind, department, sort]);
  const paging = usePagination(filtered, 10, JSON.stringify([query, kind, department, sort]));
  const hasFilters = Boolean(query || kind || department);

  function clearFilters() {
    setQuery("");
    setKind("");
    setDepartment("");
  }

  function restore(row: ArchivedRow) {
    setRestoring(`${row.kind}-${row.id}`);
    startTransition(async () => {
      try {
        const res = await restoreRecordAction(row.kind, row.id);
        if (res.ok) {
          toast.success(res.message);
          setSelected((current) => current?.id === row.id && current.kind === row.kind ? null : current);
        } else {
          toast.error(res.error);
        }
      } catch {
        toast.error("Unable to restore this record. Please try again.");
      } finally {
        setRestoring("");
      }
    });
  }

  function restoreButton(row: ArchivedRow, primary = false) {
    if (row.kind === "ROOM") return <Badge variant="outline" className="px-3 py-2">History only</Badge>;
    const busy = pending && restoring === `${row.kind}-${row.id}`;
    return (
      <Button type="button" variant={primary ? "default" : "outline"} disabled={pending} onClick={() => restore(row)} aria-label={`Restore ${row.name}`} className={cn("h-9 gap-2 px-3", !primary && "bg-card text-primary hover:border-primary/40 hover:bg-primary/5 hover:text-primary")}>
        {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : <ArrowCounterClockwise className="size-4" aria-hidden />}
        {busy ? "Restoring…" : "Restore"}
      </Button>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Filter by record type">
        {[{ value: "" as const, label: "All records", icon: Archive, color: "bg-primary/10 text-primary", count: rows.length }, ...ARCHIVE_KINDS.map((k) => ({ value: k, ...categories[k], count: counts[k] }))].map((category) => (
          <button key={category.value} type="button" aria-pressed={kind === category.value} onClick={() => setKind(category.value)} className={cn("flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-4", kind === category.value && "border-primary bg-primary/5 ring-1 ring-primary/20")}>
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", category.color)}><category.icon className="size-5" aria-hidden /></span>
            <span className="min-w-0"><span className="block text-xs font-medium text-muted-foreground">{category.label}</span><span className="mt-0.5 block text-2xl leading-none font-semibold tracking-tight tabular-nums">{category.count}</span></span>
          </button>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Past data stays preserved.</span> Archived rooms remain history only. Create a new room to reuse a room number. Other archived record types can be restored with their history intact.</p>
      </div>

      <section aria-labelledby="archive-register-title" className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5"><h2 id="archive-register-title" className="text-base font-semibold">Archive register</h2><Badge variant="secondary" className="tabular-nums" aria-live="polite" aria-atomic="true">{filtered.length} {filtered.length === 1 ? "record" : "records"}</Badge></div>
            {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground"><X className="size-3.5" aria-hidden />Clear filters</Button>}
          </div>
          <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_10rem]">
            <label className="grid min-w-0 gap-1.5"><span className="text-xs font-medium text-muted-foreground">Search records</span><span className="relative"><MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, reason, or archived by…" aria-label="Search archived records" className="h-11 bg-background/40 pl-9 sm:h-9" /></span></label>
            <label className="grid min-w-0 gap-1.5"><span className="text-xs font-medium text-muted-foreground">Department</span><NativeSelect aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="All departments" options={departments.map((d) => ({ value: d, label: d }))} /></label>
            <label className="grid min-w-0 gap-1.5"><span className="text-xs font-medium text-muted-foreground">Sort by</span><NativeSelect aria-label="Sort archived records" value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "name", label: "Name A–Z" }]} /></label>
          </div>
        </div>

        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_6.5rem] gap-5 border-y bg-muted/50 px-5 py-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase xl:grid" aria-hidden>
          <span>Record</span><span>Department</span><span>Archived</span><span>Archive reason</span><span className="text-right">Action</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Archive} title={rows.length ? "No matching records" : "No archived records"} description={rows.length ? "Try another search or clear the filters to see all archived records." : "Archived accounts, faculty, subjects, rooms, and sections will appear here."} action={hasFilters ? <Button type="button" variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined} className="rounded-none border-0 bg-transparent py-16" />
        ) : (
          <ul className="divide-y" aria-label="Archived records">
            {paging.visible.map((row) => {
              const category = categories[row.kind];
              const name = recordName(row);
              return (
                <li key={`${row.kind}-${row.id}`} className="grid min-w-0 grid-cols-2 items-start gap-4 p-4 transition-colors hover:bg-muted/25 sm:p-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_6.5rem] xl:gap-5">
                  <div className="col-span-2 flex min-w-0 items-start gap-3 xl:col-span-1">
                    <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", category.color)}><category.icon className="size-4.5" aria-hidden /></span>
                    <div className="min-w-0 space-y-1">
                      <button type="button" onClick={() => setSelected(row)} aria-label={`View details for ${row.name}`} className="block text-left text-sm leading-snug font-semibold wrap-anywhere outline-none hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring">{name.title}</button>
                      {name.subtitle && <p className="text-xs text-muted-foreground wrap-anywhere">{name.subtitle}</p>}
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground"><span className={cn("inline-flex rounded-md px-1.5 py-0.5 font-medium", category.color)}>{ARCHIVE_LABELS[row.kind]}</span>{row.kind === "USER" && <span>{row.detail}</span>}</p>
                    </div>
                  </div>
                  <div className="min-w-0"><p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase xl:hidden">Department</p><p className="text-xs leading-relaxed wrap-anywhere">{row.department}</p></div>
                  <div className="min-w-0 space-y-1"><p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase xl:hidden">Archived</p><time dateTime={row.archivedAt} className="block text-xs font-medium">{archiveDate(row.archivedAt)}</time><p className="text-[11px] leading-relaxed text-muted-foreground wrap-anywhere">{row.archivedBy === "Unknown" ? "Archiver not recorded" : `by ${row.archivedBy}`}</p></div>
                  <div className="col-span-2 min-w-0 xl:col-span-1"><p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase xl:hidden">Archive reason</p><p className="line-clamp-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground wrap-anywhere">{row.reason || "No reason provided"}</p><button type="button" onClick={() => setSelected(row)} aria-label={`View archive details for ${row.name}`} className="mt-1.5 inline-flex min-h-7 items-center gap-1 text-[11px] font-medium text-primary outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring">View details<ArrowUpRight className="size-3" aria-hidden /></button></div>
                  <div className="col-span-2 flex justify-end border-t pt-3 xl:col-span-1 xl:border-0 xl:pt-0">{restoreButton(row)}</div>
                </li>
              );
            })}
          </ul>
        )}

        {filtered.length > 0 && <div className="border-t bg-muted/20 px-4 py-4 sm:px-5">{paging.pages > 1 ? <Pagination {...paging} className="[&>div]:flex-wrap [&>div>span]:hidden sm:[&>div>span]:flex" /> : <p className="text-xs text-muted-foreground">Showing all {filtered.length} {filtered.length === 1 ? "record" : "records"}</p>}</div>}
      </section>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          <SheetHeader className="border-b p-6 pr-12"><SheetTitle>Archive details</SheetTitle><SheetDescription className="mt-1 text-xs">Review the record and why it was archived.</SheetDescription></SheetHeader>
          {selected && <>
            <div className="space-y-6 p-6">
              <div className="space-y-3"><Badge variant="secondary">{ARCHIVE_LABELS[selected.kind]}</Badge><h3 className="text-xl leading-snug font-semibold tracking-tight wrap-anywhere">{recordName(selected).title}</h3>{recordName(selected).subtitle && <p className="text-sm text-muted-foreground wrap-anywhere">{recordName(selected).subtitle}</p>}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
                {[["Department", selected.department], ["Record details", selected.detail], ["Date archived · UTC+08:00", `${archiveDate(selected.archivedAt)}, ${archiveDate(selected.archivedAt, true)}`], ["Archived by", selected.archivedBy === "Unknown" ? "Not recorded" : selected.archivedBy]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1.5 leading-relaxed font-medium wrap-anywhere">{value}</dd></div>)}
              </dl>
              <div className="space-y-2"><h4 className="text-sm font-semibold">Archive reason</h4><p className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground wrap-anywhere">{selected.reason || "No reason was provided when this record was archived."}</p></div>
            </div>
            <SheetFooter className="gap-3 border-t bg-muted/20 p-6"><p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Archive className="mt-0.5 size-4 shrink-0" aria-hidden />{selected.kind === "ROOM" ? "This room is kept for historical schedules and bookings. Create a new room to reuse its number." : "Restore this record to make it available again. Its past data will be preserved."}</p>{restoreButton(selected, true)}</SheetFooter>
          </>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
