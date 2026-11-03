"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle, Sparkle, WarningCircle } from "@phosphor-icons/react/ssr";
import { DAY_LONG, formatRange } from "@/lib/scheduler/timetable";
import { CHANGE_LABELS } from "@/lib/scheduler/resolver/explain";
import type { Change, IssueCounts, Proposal, ResolverEntry } from "@/lib/scheduler/resolver/types";
import { cn } from "@/lib/utils";

export interface Labels {
  section: (id: string) => string;
  subject: (id: string) => string;
  room: (id: string) => string;
  faculty: (id: string) => string;
}

const COUNTS: { key: keyof IssueCounts; label: string }[] = [
  { key: "unscheduled", label: "Unscheduled" },
  { key: "warnings", label: "Warnings" },
  { key: "conflicts", label: "Conflicts" },
];

function slot(e: ResolverEntry, l: Labels) {
  return `${DAY_LONG[e.dayOfWeek]} ${formatRange(e.startMin, e.endMin)}, ${l.room(e.roomId)}, ${l.faculty(e.facultyId)}`;
}

/** Proposal summary, changes grouped by section with a checkbox each, and the issues left for a person. */
export function ResolveReview({
  proposal,
  counts,
  summary,
  aiPending,
  accepted,
  onToggle,
  labels,
}: {
  proposal: Proposal;
  /** Counts after the currently accepted changes. */
  counts: IssueCounts;
  summary: string;
  aiPending: boolean;
  accepted: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  labels: Labels;
}) {
  const bySection = new Map<string, Change[]>();
  for (const c of proposal.changes) bySection.set(c.sectionId, [...(bySection.get(c.sectionId) ?? []), c]);

  return (
    <div className="space-y-5">
      <section aria-label="Summary" className="space-y-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {COUNTS.map((c) => (
            <div key={c.key} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{c.label}</dt>
              <dd className="flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                {proposal.before[c.key]} <ArrowRight className="size-4 text-muted-foreground" aria-label="becomes" /> <span className={cn(counts[c.key] < proposal.before[c.key] && "text-success")}>{counts[c.key]}</span>
              </dd>
            </div>
          ))}
          <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">Classes moved</dt>
            <dd className="text-lg font-semibold tabular-nums">{proposal.classesMoved}</dd>
          </div>
          <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">Faculty affected</dt>
            <dd className="text-lg font-semibold tabular-nums">{proposal.facultyAffected}</dd>
          </div>
        </dl>
        <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-sm" aria-live="polite">
          <Sparkle className="mt-0.5 size-4 shrink-0 text-info" />
          <span>
            {summary}
            {aiPending && <span className="text-muted-foreground"> Writing a fuller summary…</span>}
          </span>
        </p>
      </section>

      <section aria-labelledby="changes-title" className="space-y-3">
        <h3 id="changes-title" className="font-semibold">
          Changes ({accepted.size} of {proposal.changes.length} selected)
        </h3>
        {proposal.changes.length === 0 && <p className="text-sm text-muted-foreground">No safe change was found. See Unresolved below.</p>}
        {[...bySection].map(([sectionId, changes]) => (
          <fieldset key={sectionId} className="rounded-lg border">
            <legend className="ml-3 px-1 text-sm font-semibold">{labels.section(sectionId)}</legend>
            <ul className="divide-y">
              {changes.map((c) => {
                const e = (c.after ?? c.before)!;
                return (
                  <li key={c.id} className="flex gap-3 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={accepted.has(c.id)}
                      onChange={(ev) => onToggle(c.id, ev.target.checked)}
                      aria-label={`Include: ${CHANGE_LABELS[c.type]} ${labels.subject(e.subjectId)}`}
                    />
                    <div className="min-w-0 space-y-0.5">
                      <p>
                        <span className="font-medium">{labels.subject(e.subjectId)} {e.component === "LABORATORY" ? "laboratory" : "lecture"}</span>
                        <span className="ml-2 rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">{CHANGE_LABELS[c.type]}</span>
                      </p>
                      <p className="text-[13px]">
                        {c.before && <span className="text-muted-foreground">{slot(c.before, labels)}</span>}
                        {c.before && c.after && <ArrowRight className="mx-1 inline size-3.5 text-muted-foreground" aria-label="to" />}
                        {c.after && <span>{slot(c.after, labels)}</span>}
                        {!c.after && <span> (removed)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.reason}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </section>

      {proposal.unresolved.length > 0 && (
        <section aria-labelledby="unresolved-title" className="space-y-3">
          <h3 id="unresolved-title" className="flex items-center gap-2 font-semibold">
            <WarningCircle className="size-5 text-warning" weight="fill" /> Unresolved ({proposal.unresolved.length})
          </h3>
          <ul className="space-y-2">
            {proposal.unresolved.map((u) => (
              <li key={u.issue.id} className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                <p className="font-medium">
                  {labels.section(u.issue.sectionId)}: {u.issue.description}
                </p>
                <p className="text-[13px] text-muted-foreground">{u.reason}</p>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                  {u.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                {u.link && (
                  <Link href={u.link.href} className="inline-flex text-[13px] font-medium text-brand-link hover:underline">
                    {u.link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {proposal.unresolved.length === 0 && proposal.changes.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle className="size-4" weight="fill" /> Every issue in scope has a proposed fix.
        </p>
      )}
    </div>
  );
}
