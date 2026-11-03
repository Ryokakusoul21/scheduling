"use client";

import { useState } from "react";
import { MagnifyingGlass, Plus, UserCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONSTRAINT_INFO } from "@/lib/scheduler/constraints";
import { EmptyState } from "@/components/ux/states";
import { settingChips, summary, type ConstraintRow } from "./categories";
import { Chips, RuleActions, StatusControl, StrengthBadge, type RowHandlers } from "./rule-row";

const PAGE = 12;

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Preferred hours and days off, one card per faculty member, searchable and paged for large departments. */
export function FacultyPreferences({
  rows,
  names,
  onAdd,
  ...handlers
}: RowHandlers & { rows: ConstraintRow[]; names: Map<string, string>; onAdd?: () => void }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const byFaculty = rows.reduce((m, r) => m.set(String(r.params.facultyId), [...(m.get(String(r.params.facultyId)) ?? []), r]), new Map<string, ConstraintRow[]>());
  const groups = [...byFaculty.entries()]
    .map(([facultyId, items]) => ({ facultyId, name: names.get(facultyId) ?? "Unknown faculty member", items }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const shown = groups.filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section aria-labelledby="preferences-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 id="preferences-title" className="font-semibold">Individual preferences</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{groups.length}</span>
          <StrengthBadge hard={CONSTRAINT_INFO.PREFERRED_TIME.hard} />
        </div>
        {groups.length > 0 && (
          <div className="relative w-full sm:w-64">
            <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search faculty name"
              aria-label="Search individual preferences by faculty name"
              className="h-9 pl-9"
            />
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={UserCircle}
          title="No individual faculty preferences yet"
          description="Record a faculty member's preferred hours and days off."
          action={onAdd && <Button onClick={onAdd}><Plus className="size-4" /> Add preference</Button>}
          className="py-8"
        />
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No faculty member matches &quot;{query}&quot;.</p>
      ) : (
        <>
          <ul className="grid gap-3 lg:grid-cols-2">
            {shown.slice(0, limit).map((g) => (
              <li key={g.facultyId} className="flex gap-3 rounded-xl border bg-card p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info/10 text-sm font-semibold text-info" aria-hidden>
                  {initials(g.name)}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium">{g.name}</p>
                  <ul className="space-y-2">
                    {g.items.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2" title={summary(r.kind, r.params, names)}>
                        <Chips items={settingChips(r.kind, r.params, names)} />
                        <span className="flex items-center gap-1">
                          <StatusControl row={r} onToggle={handlers.onToggle} />
                          <RuleActions row={r} {...handlers} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
          {shown.length > limit && (
            <Button variant="outline" className="h-9" onClick={() => setLimit((l) => l + PAGE * 2)}>
              Show more ({shown.length - limit} more)
            </Button>
          )}
        </>
      )}
    </section>
  );
}
