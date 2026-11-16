"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock, Funnel, MagnifyingGlass, ShieldCheck, WarningCircle } from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ux/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ReportButtons } from "@/components/ux/export-buttons";
import { AdminStatCards } from "@/components/admin/stat-cards";
import { auditChanges, type AuditFilters, type AuditJson, type AuditListRow } from "@/lib/admin/audit";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions/roles";
import type { ReportDoc } from "@/lib/export/report";

const timestamp = (iso: string) => new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Taipei" });
const valueText = (value: AuditJson) => value === null ? "Not recorded" : typeof value === "string" ? value : JSON.stringify(value, null, 2);

export function AuditWorkspace({ filters, error, actors, entities, rows, stats, page, pages, pageSize }: {
  filters: AuditFilters; error: string | null; actors: { value: string; label: string }[]; entities: { value: string; label: string }[]; rows: AuditListRow[];
  stats: { total: number; blocked: number; today: number; actors: number }; page: number; pages: number; pageSize: number;
}) {
  const [selected, setSelected] = useState<AuditListRow | null>(null);
  const href = (patch: Record<string, string> = {}) => {
    const query = new URLSearchParams({ q: filters.q, actor: filters.actor, entity: filters.entity, record: filters.record, from: filters.from, to: filters.to, blocked: filters.blocked ? "1" : "", ...patch });
    for (const [key, value] of [...query]) if (!value) query.delete(key);
    return `/admin/audit-logs${query.size ? `?${query}` : ""}`;
  };
  const changes = selected ? auditChanges(selected.oldValue, selected.newValue) : [];
  const doc: ReportDoc<AuditListRow> = {
    title: "System Audit Log", filename: `audit-log-page-${page}`, landscape: true,
    term: `Page ${page} of ${pages} · ${rows.length} of ${stats.total} matching events · UTC+08:00${filters.from ? ` · From ${filters.from}` : ""}${filters.to ? ` · To ${filters.to}` : ""}${filters.q ? ` · Search: ${filters.q}` : ""}${filters.actor ? ` · Actor: ${actors.find((actor) => actor.value === filters.actor)?.label ?? filters.actor}` : ""}${filters.entity ? ` · Resource: ${filters.entity}` : ""}${filters.record ? ` · Record: ${filters.record}` : ""}${filters.blocked ? " · Blocked attempts only" : ""}`,
    rows, columns: [
      { header: "Timestamp (UTC+08:00)", value: (row) => timestamp(row.createdAt) }, { header: "Actor", value: (row) => row.actor },
      { header: "Role at event", value: (row) => row.role ? ROLE_LABELS[row.role as AppRole] ?? row.role : "Not recorded" },
      { header: "Action", value: (row) => row.action }, { header: "Resource", value: (row) => row.entity }, { header: "Record ID", value: (row) => row.entityId },
      { header: "Reason", value: (row) => row.reason }, { header: "IP address", value: (row) => row.ipAddress },
      { header: "Before (redacted)", value: (row) => row.oldValue === null ? "" : JSON.stringify(row.oldValue) }, { header: "After (redacted)", value: (row) => row.newValue === null ? "" : JSON.stringify(row.newValue) },
      { header: "Event ID", value: (row) => row.id },
    ],
  };
  return <div className="space-y-5">
    <AdminStatCards items={[
      { label: "Matching events", value: stats.total, hint: "Across the permitted history and current filters" },
      { label: "Events today", value: stats.today, hint: "Since midnight, UTC+08:00, within these filters" },
      { label: "Acting accounts", value: stats.actors, hint: "Distinct user accounts; system events excluded" },
      { label: "Blocked attempts", value: stats.blocked, hint: "Explicitly recorded as blocked actions", attention: stats.blocked > 0 },
    ]} />
    <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Funnel className="size-4 text-primary" />Find recorded activity</CardTitle><p className="mt-1 text-xs text-muted-foreground">Search the permitted history by actor, resource, record, or date.</p></div><Link href="/admin/audit-logs" className="text-xs font-medium text-primary hover:underline">Clear filters</Link></CardHeader><CardContent>
      <form action="/admin/audit-logs" method="get" className="space-y-4">
        {filters.record && <><input type="hidden" name="record" value={filters.record} /><p className="rounded-lg bg-primary/5 px-3 py-2 text-xs">Viewing record <code className="break-all font-medium">{filters.record}</code></p></>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="relative sm:col-span-2"><span className="sr-only">Search audit history</span><MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden /><Input name="q" defaultValue={filters.q} maxLength={200} placeholder="Search an action, name, email, or record ID…" className="pl-9" /></label><NativeSelect name="actor" aria-label="Filter audit by actor" defaultValue={filters.actor} options={[{ value: "", label: "All actors" }, { value: "SYSTEM", label: "System events" }, ...actors]} /><NativeSelect name="entity" aria-label="Filter audit by resource" defaultValue={filters.entity} options={[{ value: "", label: "All resources" }, ...entities]} /></div>
        <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1.5 text-xs text-muted-foreground">From date<Input name="from" type="date" defaultValue={filters.from} className="w-full sm:w-44" /></label><label className="grid gap-1.5 text-xs text-muted-foreground">To date<Input name="to" type="date" defaultValue={filters.to} className="w-full sm:w-44" /></label><label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" name="blocked" value="1" defaultChecked={filters.blocked} className="size-4 accent-primary" />Blocked attempts only</label><Button type="submit" className="sm:ml-auto"><MagnifyingGlass className="size-4" />Apply filters</Button></div>
      </form>
      {error && <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    </CardContent></Card>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"><p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" />Read-only event history. Sensitive credential fields are redacted from details and exports.</p>{stats.blocked > 0 && !filters.blocked && <Link href={href({ blocked: "1", page: "1" })} className="text-xs font-medium text-primary hover:underline">Inspect blocked attempts</Link>}</div>

    <Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle>Activity register</CardTitle><p className="mt-1 text-xs text-muted-foreground">Newest events first · timestamps use UTC+08:00</p></div><div className="space-y-1"><ReportButtons doc={doc} /><p className="text-right text-[10px] text-muted-foreground">Exports include this page of events.</p></div></CardHeader><CardContent className="space-y-4"><div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Actor</TableHead><TableHead>Recorded action</TableHead><TableHead>Resource</TableHead><TableHead><span className="sr-only">View event details</span></TableHead></TableRow></TableHeader><TableBody>
      {rows.map((row) => <TableRow key={row.id}><TableCell className="min-w-40 whitespace-nowrap text-xs">{timestamp(row.createdAt)}</TableCell><TableCell className="min-w-36"><p className="text-sm font-medium">{row.actor}</p><p className="mt-1 text-[11px] text-muted-foreground">{row.role ? ROLE_LABELS[row.role as AppRole] ?? row.role : "Role not recorded"}</p></TableCell><TableCell className="min-w-64 max-w-lg"><p className="text-sm leading-relaxed">{row.action}</p>{row.action.startsWith("Blocked:") && <Badge variant="outline" className="mt-1.5 border-amber-500/40 text-amber-800 dark:text-amber-200"><WarningCircle className="size-3" />Blocked</Badge>}</TableCell><TableCell><Badge variant="secondary">{row.entity}</Badge>{row.entityId && <p className="mt-1.5 max-w-40 truncate font-mono text-[10px] text-muted-foreground" title={row.entityId}>{row.entityId}</p>}</TableCell><TableCell><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(row)} aria-label={`View audit event: ${row.action}`}>Details<ArrowUpRight className="size-3.5" /></Button></TableCell></TableRow>)}
      {!rows.length && <TableRow><TableCell colSpan={5} className="py-12 text-center"><Clock className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="font-medium">No events match these filters</p><p className="mt-1 text-xs text-muted-foreground">Clear the filters or choose another date range.</p></TableCell></TableRow>}
    </TableBody></Table></div><div className="flex flex-wrap items-center justify-between gap-3 text-xs"><p className="text-muted-foreground">{stats.total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, stats.total)} of ${stats.total} events` : "0 events"}</p><div className="flex items-center gap-3">{page > 1 ? <Link href={href({ page: String(page - 1) })} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 font-medium hover:bg-muted"><ArrowLeft className="size-3.5" />Previous</Link> : <span className="px-3 py-2 text-muted-foreground" aria-disabled="true">Previous</span>}<span className="tabular-nums">Page {page} of {pages}</span>{page < pages ? <Link href={href({ page: String(page + 1) })} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 font-medium hover:bg-muted">Next<ArrowRight className="size-3.5" /></Link> : <span className="px-3 py-2 text-muted-foreground" aria-disabled="true">Next</span>}</div></div></CardContent></Card>

    <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"><SheetHeader><SheetTitle>Recorded event</SheetTitle><SheetDescription>Inspect the actor, target record, and recorded change. This view does not modify history.</SheetDescription></SheetHeader>{selected && <div className="space-y-5 px-4 pb-6"><div className="rounded-xl border bg-muted/40 p-4"><Badge variant="secondary">{selected.entity}</Badge><h3 className="mt-3 text-base font-semibold leading-relaxed">{selected.action}</h3><p className="mt-2 text-xs text-muted-foreground">{timestamp(selected.createdAt)} · UTC+08:00</p></div><dl className="grid gap-4 text-sm sm:grid-cols-2">{[
      ["Actor", selected.actor], ["Email", selected.email ?? "Not recorded"], ["Role at event", selected.role ? ROLE_LABELS[selected.role as AppRole] ?? selected.role : "Not recorded"], ["IP address", selected.ipAddress ?? "Not recorded"], ["Record ID", selected.entityId ?? "Not recorded"], ["Event ID", selected.id],
    ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>)}</dl><div><h3 className="text-sm font-semibold">Recorded reason</h3><p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{selected.reason || "No reason was recorded for this event."}</p></div>
      <section className="space-y-3"><h3 className="text-sm font-semibold">What changed <span className="font-normal text-muted-foreground">({changes.length} recorded fields)</span></h3>{changes.length ? <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead></TableRow></TableHeader><TableBody>{changes.map((change) => <TableRow key={change.field}><TableCell className="max-w-44 break-words font-mono text-xs">{change.field}</TableCell><TableCell className="min-w-40 max-w-xs whitespace-pre-wrap break-words text-xs text-muted-foreground">{valueText(change.before)}</TableCell><TableCell className="min-w-40 max-w-xs whitespace-pre-wrap break-words text-xs">{valueText(change.after)}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">{selected.oldValue === null && selected.newValue === null ? "This event has no before-and-after snapshot. Refer to the recorded action and reason." : "No differences are visible in the redacted snapshots."}</p>}</section>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-xs font-medium">View redacted snapshots</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{[["Before", selected.oldValue], ["After", selected.newValue]].map(([label, value]) => <div key={String(label)}><h4 className="mb-2 text-xs font-medium">{String(label)}</h4><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-[11px]">{value === null ? "Not recorded" : JSON.stringify(value, null, 2)}</pre></div>)}</div></details>
    </div>}</SheetContent></Sheet>
  </div>;
}
