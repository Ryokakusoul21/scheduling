"use client";

import { ArrowDown, ArrowUp, ArrowsDownUp, Check, DotsThree, Eye, PencilSimple, Prohibit, X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatWhen, timeAgo } from "@/lib/format/when";
import type { RequestRow } from "@/lib/requests/rules";
import { cn } from "@/lib/utils";
import { RequestTypeBadge } from "./request-type-badge";
import { StatusBadge } from "./status-badge";

export type SortKey = "type" | "schedule" | "requestedBy" | "createdAt" | "status";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export type RowHandlers = {
  onOpen: (row: RequestRow) => void;
  onEdit: (row: RequestRow) => void;
  onCancel: (row: RequestRow) => void;
  onReview: (row: RequestRow, status: "APPROVED" | "REJECTED") => void;
};

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

/** The ⋯ menu: view for everyone, edit and cancel for the owner of a pending request, approve and reject for reviewers. */
function RowMenu({ row, ...h }: { row: RequestRow } & RowHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for the ${row.scheduleLabel} request`} onClick={(e) => e.stopPropagation()} />}>
        <DotsThree className="size-5" weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => h.onOpen(row)}><Eye className="size-4" /> View details</DropdownMenuItem>
        {row.canEdit && <DropdownMenuItem onClick={() => h.onEdit(row)}><PencilSimple className="size-4" /> Edit</DropdownMenuItem>}
        {row.canReview && <DropdownMenuSeparator />}
        {row.canReview && <DropdownMenuItem onClick={() => h.onReview(row, "APPROVED")}><Check className="size-4" /> Approve</DropdownMenuItem>}
        {row.canReview && <DropdownMenuItem variant="destructive" onClick={() => h.onReview(row, "REJECTED")}><X className="size-4" /> Reject</DropdownMenuItem>}
        {row.canCancel && <DropdownMenuSeparator />}
        {row.canCancel && <DropdownMenuItem variant="destructive" onClick={() => h.onCancel(row)}><Prohibit className="size-4" /> Cancel request</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Long details are clipped to one line; the full text shows in a tooltip. */
function Details({ row }: { row: RequestRow }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block max-w-[22rem] truncate text-left" />}>{row.reason}</TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-pre-wrap">{row.reason}</TooltipContent>
    </Tooltip>
  );
}

function SortHeader({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowsDownUp : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("h-11 border-b px-3 text-left text-sm font-medium text-muted-foreground", className)}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {label} <Icon className="size-3.5" aria-hidden />
      </button>
    </th>
  );
}

export function RequestsTable({ rows, sort, onSort, ...h }: { rows: RequestRow[]; sort: Sort; onSort: (k: SortKey) => void } & RowHandlers) {
  const plain = "h-11 border-b px-3 text-left text-sm font-medium text-muted-foreground";
  return (
    <div className="max-h-[65vh] overflow-auto">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <SortHeader label="Type" k="type" sort={sort} onSort={onSort} />
            <SortHeader label="Class" k="schedule" sort={sort} onSort={onSort} />
            <SortHeader label="Requested by" k="requestedBy" sort={sort} onSort={onSort} />
            <th scope="col" className={plain}>Details</th>
            <SortHeader label="Created" k="createdAt" sort={sort} onSort={onSort} />
            <SortHeader label="Status" k="status" sort={sort} onSort={onSort} />
            <th scope="col" className={plain}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => h.onOpen(r)} className="cursor-pointer hover:bg-muted/40">
              <td className="border-b px-3 py-3">
                <button type="button" onClick={(e) => { e.stopPropagation(); h.onOpen(r); }} aria-label={`Open details of the ${r.scheduleLabel} request`} className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"><RequestTypeBadge type={r.type} /></button>
              </td>
              <td className="border-b px-3 py-3">{r.scheduleLabel}</td>
              <td className="border-b px-3 py-3">{r.requestedByName}</td>
              <td className="border-b px-3 py-3"><Details row={r} /></td>
              <td className="whitespace-nowrap border-b px-3 py-3">
                <span className="block">{timeAgo(new Date(r.createdAt))}</span>
                <span className="block text-sm text-muted-foreground">{dateOf(r.createdAt)}</span>
              </td>
              <td className="border-b px-3 py-3"><StatusBadge status={r.status} /></td>
              <td className="border-b px-3 py-3 text-right"><RowMenu row={r} {...h} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Card layout used on phones. */
export function RequestCards({ rows, ...h }: { rows: RequestRow[] } & RowHandlers) {
  return (
    <ul className="space-y-3 p-3">
      {rows.map((r) => (
        <li key={r.id} className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <button type="button" onClick={() => h.onOpen(r)} className="min-w-0 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <RequestTypeBadge type={r.type} />
              <span className="mt-2 block font-medium">{r.scheduleLabel}</span>
            </button>
            <RowMenu row={r} {...h} />
          </div>
          <p className="mt-2 line-clamp-3 text-sm">{r.reason}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{r.requestedByName} · {formatWhen(new Date(r.createdAt))}</span>
            <StatusBadge status={r.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
