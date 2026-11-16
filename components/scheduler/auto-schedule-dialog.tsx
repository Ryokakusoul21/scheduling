"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowsClockwise, CaretDown, ChalkboardTeacher, CheckCircle, Clock, Eye, EyeSlash, FloppyDisk, Lightning, MapPin, PushPin, User, WarningCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { previewAutoScheduleAction, applyAutoScheduleAction } from "@/app/(dashboard)/scheduler/auto-schedule-actions";
import type { Change, Proposal } from "@/lib/scheduler/resolver/types";
import { DAY_LONG, formatRange } from "@/lib/scheduler/timetable";
import { cn } from "@/lib/utils";
import { DialogHero, Fact, Segmented } from "./process-dialog-parts";
import { ProcessAnimation } from "./process-animation";
import type { Labels } from "./resolve-review";

const STAGES = ["Read curriculum", "Place meetings", "Check conflicts"];
const MIN_RUN_MS = 2400;

type Scope = "section" | "filter";

/** Auto-Schedule: pick the sections, generate a preview, untick what to skip, then save the rest as drafts. */
export function AutoScheduleDialog({ selectedSectionId, filterSectionIds, labels, onPreview, onApplied, onClose }: {
  selectedSectionId?: string;
  filterSectionIds: string[];
  labels: Labels;
  onPreview: (changes: Change[] | null) => void;
  onApplied: (changes: Change[]) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>(selectedSectionId ? "section" : "filter");
  const [result, setResult] = useState<{ proposalId: string | null; proposal: Proposal; summary: string } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const sectionIds = scope === "section" && selectedSectionId ? [selectedSectionId] : filterSectionIds;

  function generate() {
    setError(""); onPreview(null); setPreviewing(false); setResult(null);
    startTransition(async () => {
      try {
        // The short wait keeps the process animation visible when the preview returns instantly.
        const [res] = await Promise.all([previewAutoScheduleAction({ sectionIds }), new Promise((r) => setTimeout(r, MIN_RUN_MS))]);
        if (!res.ok) { setError(res.error); return; }
        setResult(res.data); setAccepted(new Set(res.data.proposal.changes.map((c) => c.id)));
      } catch { setError("Could not generate a preview. Please retry."); }
    });
  }

  function close() { onPreview(null); onClose(); }
  function choose(next: Scope) { setScope(next); setResult(null); setPreviewing(false); onPreview(null); }
  function toggle(id: string) {
    const next = new Set(accepted);
    if (next.has(id)) next.delete(id); else next.add(id);
    setAccepted(next);
    if (previewing) onPreview(result!.proposal.changes.filter((c) => next.has(c.id)));
  }
  function apply() {
    if (!result?.proposalId) return;
    setError("");
    startTransition(async () => {
      try {
        const res = await applyAutoScheduleAction({ proposalId: result.proposalId!, changeIds: [...accepted] });
        if (!res.ok) { setError(res.error); return; }
        onApplied(res.changes); close(); router.refresh();
        toast.success(`${res.changes.length} draft meeting${res.changes.length === 1 ? "" : "s"} saved. Review before submitting.`);
      } catch { setError("Could not save these meetings. Refresh the timetable and generate a new preview."); }
    });
  }

  const changes = result?.proposal.changes ?? [];
  const unresolved = result?.proposal.unresolved ?? [];
  const groups = new Map<string, Change[]>();
  for (const c of changes) groups.set(c.after!.sectionId, [...(groups.get(c.after!.sectionId) ?? []), c]);
  const generating = pending && !result;

  return <Dialog open onOpenChange={(open) => !open && !pending && close()}>
    <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
      <DialogHero icon={Lightning} title="Auto-Schedule" description={result ? "Preview only. Untick anything to skip." : "Places the remaining curriculum hours as drafts."} />
      <div className="min-h-0 space-y-4 overflow-y-auto">
        {!generating && <Segmented
          name="auto-scope"
          legend="Sections"
          value={scope}
          onChange={choose}
          disabled={pending}
          options={[
            ...(selectedSectionId ? [{ value: "section" as const, label: labels.section(selectedSectionId) }] : []),
            { value: "filter", label: "All sections", count: filterSectionIds.length },
          ]}
        />}
        {!sectionIds.length && <p className="text-sm text-muted-foreground">No editable sections match these filters.</p>}
        {generating && <ProcessAnimation stages={STAGES} label="Building preview…" />}
        {!result && !generating && <div className="flex flex-wrap gap-1.5">
          <Fact icon={PushPin}>Existing meetings stay</Fact>
          <Fact icon={ChalkboardTeacher}>Assigned teachers</Fact>
          <Fact icon={FloppyDisk}>Saved as drafts</Fact>
        </div>}

        {result && <div className="space-y-3" aria-live="polite">
          <dl className="grid grid-cols-3 gap-2">
            {([["Meetings", `${accepted.size}/${changes.length}`, false], ["Sections", groups.size, false], ["Blocked", unresolved.length, unresolved.length > 0]] as const).map(([label, value, warn]) => (
              <div key={label} className={cn("rounded-lg border p-3", warn && "border-warning/50 bg-warning/5")}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {!changes.length && !unresolved.length && <p className="flex items-center gap-2 rounded-lg border p-3 text-sm"><CheckCircle weight="fill" className="size-5 text-success" aria-hidden />Nothing left to place.</p>}

          {[...groups].map(([sectionId, list], index) => (
            <details key={sectionId} open={index === 0} className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <CaretDown className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{labels.section(sectionId)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{list.filter((c) => accepted.has(c.id)).length}/{list.length}</span>
              </summary>
              <ul className="divide-y border-t">
                {list.map((c) => {
                  const e = c.after!;
                  return <li key={c.id}>
                    <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40", !accepted.has(c.id) && "opacity-60")}>
                      <input type="checkbox" checked={accepted.has(c.id)} disabled={pending} onChange={() => toggle(c.id)} className="mt-0.5 size-4 accent-primary" />
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{labels.subject(e.subjectId)}{e.component === "LABORATORY" && <span className="rounded bg-info/10 px-1.5 py-px text-xs text-info">Laboratory</span>}</span>
                        <span className="flex flex-wrap gap-1.5">
                          <Fact icon={Clock}>{DAY_LONG[e.dayOfWeek]} {formatRange(e.startMin, e.endMin)}</Fact>
                          <Fact icon={MapPin}>{labels.room(e.roomId)}</Fact>
                          <Fact icon={User}>{labels.faculty(e.facultyId)}</Fact>
                        </span>
                      </span>
                    </label>
                  </li>;
                })}
              </ul>
            </details>
          ))}

          {unresolved.length > 0 && <details className="group rounded-lg border border-warning/50">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <WarningCircle weight="fill" className="size-4 shrink-0 text-warning" aria-hidden />
              <span className="flex-1">Needs attention</span>
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium tabular-nums">{unresolved.length}</span>
              <CaretDown className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" aria-hidden />
            </summary>
            <ul className="divide-y border-t text-sm">
              {unresolved.map((u, i) => <li key={`${u.issue.id}-${i}`} className="space-y-0.5 px-3 py-2.5">
                <p className="font-medium">{labels.section(u.issue.sectionId)} · {u.issue.subjectId ? labels.subject(u.issue.subjectId) : "Class"}</p>
                <p className="text-xs text-muted-foreground">{u.reason}</p>
                {u.link && <Link href={u.link.href} className="text-xs font-medium text-primary underline underline-offset-4">{u.link.label}</Link>}
              </li>)}
            </ul>
          </details>}
        </div>}
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={close}>Cancel</Button>
        {result && selectedSectionId && <Button variant="outline" disabled={pending || !accepted.size} onClick={() => { onPreview(previewing ? null : changes.filter((c) => accepted.has(c.id))); setPreviewing(!previewing); }}>{previewing ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}{previewing ? "Hide on timetable" : "Show on timetable"}</Button>}
        {result
          ? <Button variant="outline" disabled={pending || !sectionIds.length} onClick={generate}><ArrowsClockwise className="size-4" /> Generate again</Button>
          : <Button disabled={pending || !sectionIds.length} onClick={generate}><Lightning className="size-4" /> {pending ? "Working…" : "Generate preview"}</Button>}
        {result?.proposalId && <Button disabled={pending || !accepted.size} onClick={apply}><FloppyDisk className="size-4" /> Save {accepted.size} draft{accepted.size === 1 ? "" : "s"}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
