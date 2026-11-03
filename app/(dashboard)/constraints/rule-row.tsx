"use client";

import { Buildings, Copy, DotsThree, Lock, PencilSimple, ShieldCheck, Star, Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONSTRAINT_INFO, LOCKED_KINDS } from "@/lib/scheduler/constraints";
import { cn } from "@/lib/utils";
import { settingChips, summary, type ConstraintRow } from "./categories";

export interface RowHandlers {
  onToggle: (row: ConstraintRow, enabled: boolean) => void;
  onEdit: (row: ConstraintRow) => void;
  onDuplicate: (row: ConstraintRow) => void;
  onDelete: (row: ConstraintRow) => void;
}

const BADGE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

/** "Required" for hard rules the scheduler never breaks, "Preferred" for soft rules it tries to follow. */
export function StrengthBadge({ hard }: { hard: boolean }) {
  return hard ? (
    <span className={cn(BADGE, "bg-info/10 text-info")}><ShieldCheck className="size-3.5" weight="fill" /> Required</span>
  ) : (
    <span className={cn(BADGE, "bg-muted text-muted-foreground")}><Star className="size-3.5" /> Preferred</span>
  );
}

/** Scope only when it differs from the viewer's default: department rules for the Administrator, school-wide rules for a Head of Department. */
function ScopeBadge({ row, isAdmin }: { row: ConstraintRow; isAdmin: boolean }) {
  const label = row.departmentId ? (isAdmin ? row.department : null) : isAdmin ? null : "School-wide";
  if (!label) return null;
  return <span className={cn(BADGE, "border")}><Buildings className="size-3.5" /> {label}</span>;
}

export function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <li key={c} className="rounded-md bg-muted px-2 py-1 text-[13px] font-medium tabular-nums">{c}</li>
      ))}
    </ul>
  );
}

/** Toggle with a visible On or Off label, a lock for read-only rules, or "Always enforced" for system rules. */
export function StatusControl({ row, onToggle }: { row: ConstraintRow; onToggle: RowHandlers["onToggle"] }) {
  if (LOCKED_KINDS.includes(row.kind)) {
    return <span className={cn(BADGE, "bg-success/10 text-success")}><ShieldCheck className="size-3.5" weight="fill" /> Always enforced</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <Switch
        checked={row.enabled}
        disabled={!row.editable}
        aria-disabled={!row.editable || undefined}
        onCheckedChange={(v) => onToggle(row, v)}
        aria-label={`${row.enabled ? "Turn off" : "Turn on"} ${row.name}`}
        className={cn(!row.editable && "cursor-not-allowed")}
      />
      <span className={cn("w-7 text-sm font-medium", row.enabled ? "text-success" : "text-muted-foreground")} aria-hidden>
        {row.enabled ? "On" : "Off"}
      </span>
      {!row.editable && (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="rounded-sm text-muted-foreground" />}>
            <Lock className="size-4" />
            <span className="sr-only">Set by Administrator</span>
          </TooltipTrigger>
          <TooltipContent>Set by Administrator</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

/** Overflow menu for rules the viewer may change; an empty cell keeps columns aligned otherwise. */
export function RuleActions({ row, onEdit, onDuplicate, onDelete }: Omit<RowHandlers, "onToggle"> & { row: ConstraintRow }) {
  if (!row.editable || LOCKED_KINDS.includes(row.kind)) return <span className="size-8" aria-hidden />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`More actions for ${row.name}`} />}>
        <DotsThree className="size-5" weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(row)}><PencilSimple className="size-4" /> Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(row)}><Copy className="size-4" /> Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(row)}><Trash className="size-4" /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Same columns on every tab; below lg each row stacks into a card.
export const ROW_GRID = "grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_10rem_2rem] lg:items-center lg:gap-4";

/** One rule: title and badges, settings chips with the full sentence on hover, status, and actions. */
export function RuleRow({ row, names, isAdmin, ...handlers }: RowHandlers & { row: ConstraintRow; names: Map<string, string>; isAdmin: boolean }) {
  const info = CONSTRAINT_INFO[row.kind];
  const chips = settingChips(row.kind, row.params, names);
  // A secondary line only when it says something the title does not.
  const secondary = row.name.toLowerCase() !== info.label.toLowerCase() ? info.label : chips.length === 0 ? info.description : null;

  return (
    <li className={cn(ROW_GRID, "rounded-xl border bg-card p-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-3")}>
      <div className="min-w-0 space-y-1.5">
        <p className="font-medium">{row.name}</p>
        {secondary && <p className="text-[13px] text-muted-foreground">{secondary}</p>}
        <div className="flex flex-wrap gap-1.5">
          <StrengthBadge hard={info.hard} />
          <ScopeBadge row={row} isAdmin={isAdmin} />
        </div>
      </div>
      <div className="min-w-0">
        {chips.length > 0 && (
          <Tooltip>
            <TooltipTrigger render={<div tabIndex={0} className="w-fit rounded-md" aria-label={summary(row.kind, row.params, names)} />}>
              <Chips items={chips} />
            </TooltipTrigger>
            <TooltipContent>{summary(row.kind, row.params, names)}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3 lg:contents lg:border-0 lg:pt-0">
        <StatusControl row={row} onToggle={handlers.onToggle} />
        <RuleActions row={row} {...handlers} />
      </div>
    </li>
  );
}
