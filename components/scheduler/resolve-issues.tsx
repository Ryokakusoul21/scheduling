"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch, Eye, MagicWand } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { checkSelection } from "@/lib/scheduler/resolver/changes";
import { summaryFacts, templateSummary } from "@/lib/scheduler/resolver/explain";
import { DEFAULT_OPTIONS, ISSUE_KINDS, type Change, type IssueCounts, type IssueKind, type Proposal, type ResolverEntry, type ResolverInput } from "@/lib/scheduler/resolver/types";
import { applyRepairAction, narrateRepairAction, repairStampAction, undoRepairAction } from "@/app/(dashboard)/scheduler/resolve-actions";
import { cn } from "@/lib/utils";
import { ResolveReview, type Labels } from "./resolve-review";
import { useResolver } from "./use-resolver";

export interface ResolveRequest {
  scope: "filter" | "selected" | "issue";
  sectionIds?: string[];
  issueId?: string;
  issueLabel?: string;
  kinds?: IssueKind[];
}

const KIND_LABELS: Record<IssueKind, string> = {
  UNSCHEDULED: "Unscheduled classes",
  HOURS: "Hours that do not match the subject",
  ROOM_TYPE: "Room type mismatches",
  CONFLICT: "Double bookings",
};

type Phase = { name: "options" } | { name: "review"; proposal: Proposal; base: ResolverEntry[]; generatedAt: string };

/**
 * Resolve issues: options, a cancellable run in a Web Worker, then a review where each change can be
 * unchecked (the rest is re-checked), previewed on the timetable, and applied as one undoable change.
 */
export function ResolveIssues({
  request,
  onClose,
  filterSectionIds,
  buildInput,
  labels,
  onPreview,
  onApplied,
  onUndone,
}: {
  request: ResolveRequest | null;
  onClose: () => void;
  /** Editable sections in the current filter. */
  filterSectionIds: string[];
  buildInput: () => ResolverInput;
  labels: Labels;
  onPreview: (changes: Change[] | null) => void;
  onApplied: (changes: Change[]) => void;
  onUndone: (restored: ResolverEntry[], removedIds: string[]) => void;
}) {
  const { run, cancel, progress } = useResolver();
  const [scope, setScope] = useState<ResolveRequest["scope"]>(request?.scope ?? "filter");
  const [selected, setSelected] = useState<string[]>(request?.sectionIds ?? []);
  const [kinds, setKinds] = useState<IssueKind[]>(request?.kinds ?? ISSUE_KINDS);
  const [keepFaculty, setKeepFaculty] = useState(DEFAULT_OPTIONS.keepFaculty);
  const [moveComplete, setMoveComplete] = useState(DEFAULT_OPTIONS.moveCompleteSections);
  const [retime, setRetime] = useState(DEFAULT_OPTIONS.retime);
  const [phase, setPhase] = useState<Phase>({ name: "options" });
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<IssueCounts | null>(null);
  const [summary, setSummary] = useState("");
  const [narrative, setNarrative] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [applying, startApply] = useTransition();

  const sectionIds = scope === "filter" ? filterSectionIds : scope === "selected" ? selected : (request?.sectionIds ?? filterSectionIds);
  const options = { ...DEFAULT_OPTIONS, sectionIds, issueIds: scope === "issue" && request?.issueId ? [request.issueId] : undefined, kinds, keepFaculty, moveCompleteSections: moveComplete, retime };

  async function start() {
    const input = buildInput();
    const stamp = await repairStampAction();
    if (!stamp.ok) return void toast.error(stamp.error);
    setAnnouncement("Looking for fixes.");
    const proposal = await run(input, options);
    if (!proposal) return setAnnouncement("Cancelled.");
    const ids = proposal.changes.map((c) => c.id);
    setAccepted(new Set(ids));
    setCounts(proposal.after);
    const text = templateSummary(proposal);
    setSummary(text);
    setNarrative(null);
    setPhase({ name: "review", proposal, base: input.entries, generatedAt: stamp.data.generatedAt });
    setAnnouncement(`Proposal ready: ${proposal.changes.length} changes, ${proposal.unresolved.length} unresolved.`);
    // The language model only rewords the result; the solver's changes stand on their own.
    setAiPending(true);
    narrateRepairAction(summaryFacts(proposal))
      .then((res) => {
        if (res.ok && res.data.text) {
          setSummary(res.data.text);
          setNarrative(res.data.text);
        }
      })
      .finally(() => setAiPending(false));
  }

  function toggle(id: string, on: boolean) {
    if (phase.name !== "review") return;
    const next = new Set(accepted);
    if (on) next.add(id);
    else next.delete(id);
    const result = checkSelection(buildInput(), phase.base, phase.proposal.changes, next, new Set(sectionIds));
    const extra = result.dropped.filter((d) => next.has(d)).length;
    setAccepted(new Set(result.accepted));
    setCounts(result.counts);
    if (extra) setAnnouncement(`${extra} linked change${extra === 1 ? " was" : "s were"} also unchecked because ${extra === 1 ? "it depends" : "they depend"} on it.`);
    if (previewing) onPreview(phase.proposal.changes.filter((c) => result.accepted.includes(c.id)));
  }

  function close() {
    cancel();
    onPreview(null);
    setPreviewing(false);
    onClose();
  }

  function preview(on: boolean) {
    if (phase.name !== "review") return;
    setPreviewing(on);
    onPreview(on ? phase.proposal.changes.filter((c) => accepted.has(c.id)) : null);
  }

  function undo(proposalId: string) {
    void undoRepairAction(proposalId).then((res) => {
      if (!res.ok) return void toast.error(res.error, { duration: 10000 });
      onUndone(res.data.entries, res.data.removedIds);
      toast.success("Changes undone. Every class is back where it was.");
    });
  }

  function apply() {
    if (phase.name !== "review") return;
    const chosen = phase.proposal.changes.filter((c) => accepted.has(c.id));
    startApply(async () => {
      const res = await applyRepairAction({ changes: chosen, generatedAt: phase.generatedAt, options: { ...options }, summary, narrative });
      if (!res.ok) {
        setAnnouncement(res.error);
        toast.error(res.error, res.stale ? { action: { label: "Run again", onClick: () => { setPhase({ name: "options" }); void start(); } }, duration: 12000 } : { duration: 10000 });
        return;
      }
      onApplied(res.data.changes);
      const message = `${res.data.changes.length} change${res.data.changes.length === 1 ? "" : "s"} applied. Affected faculty were notified.`;
      toast.success(message, { action: { label: "Undo", onClick: () => undo(res.data.proposalId) }, duration: 12000 });
      close();
    });
  }

  const check = (label: string, value: boolean, set: (v: boolean) => void, hint?: string) => (
    <label key={label} className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={value} onChange={(e) => set(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );

  const reviewing = phase.name === "review";
  const count = reviewing ? accepted.size : 0;

  return (
    <>
      <p aria-live="polite" className="sr-only">{progress ? `${progress.step}…` : announcement}</p>
      <Dialog open={!!request && !previewing} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Resolve issues</DialogTitle>
            <DialogDescription>
              {reviewing ? "Review the proposed changes. Nothing changes until you apply them." : "The solver proposes fixes that never break a required rule. You review them before anything changes."}
            </DialogDescription>
          </DialogHeader>

          {progress ? (
            <div className="space-y-3 py-6" role="status">
              <p className="flex items-center gap-2 font-medium">
                <CircleNotch className="size-5 animate-spin" /> {progress.step}…
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              </div>
              <p className="text-[13px] text-muted-foreground">{progress.done} of {progress.total} tasks</p>
            </div>
          ) : reviewing ? (
            <ResolveReview proposal={phase.proposal} counts={counts ?? phase.proposal.after} summary={summary} aiPending={aiPending} accepted={accepted} onToggle={toggle} labels={labels} />
          ) : (
            <div className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">Scope</legend>
                {([
                  ["filter", `All sections in the current filter (${filterSectionIds.length})`],
                  ["selected", "Selected sections"],
                  ...(request?.issueId ? [["issue", `This issue only: ${request.issueLabel ?? ""}`]] : []),
                ] as [ResolveRequest["scope"], string][]).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2.5 text-sm">
                    <input type="radio" name="resolve-scope" className="size-4 accent-primary" checked={scope === value} onChange={() => setScope(value)} />
                    {label}
                  </label>
                ))}
                {scope === "selected" && (
                  <div className="ml-6 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {filterSectionIds.map((id) => (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4 accent-primary" checked={selected.includes(id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id)))} />
                        {labels.section(id)}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">Issue types to fix</legend>
                {ISSUE_KINDS.map((k) => check(KIND_LABELS[k], kinds.includes(k), (v) => setKinds((list) => (v ? [...list, k] : list.filter((x) => x !== k)))))}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">Limits on the fix</legend>
                {check("Keep faculty assignments", keepFaculty, setKeepFaculty, "New meetings go to the faculty member already teaching the subject in that section.")}
                {check("Allow moving classes in complete sections", moveComplete, setMoveComplete, "Lets the solver move a class of a fully scheduled section to make room.")}
                {check("Allow changing the time of scheduled classes", retime, setRetime, "When off, existing classes only change rooms.")}
              </fieldset>
            </div>
          )}

          <DialogFooter className="gap-2">
            {progress ? (
              <Button variant="outline" onClick={cancel}>Cancel</Button>
            ) : reviewing ? (
              <>
                <Button variant="outline" onClick={close}>Discard</Button>
                <Button variant="outline" onClick={() => preview(true)} disabled={count === 0}>
                  <Eye className="size-4" /> Preview in timetable
                </Button>
                <Button onClick={apply} disabled={applying || count === 0}>
                  {applying && <CircleNotch className="size-4 animate-spin" />} Apply {count} change{count === 1 ? "" : "s"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button onClick={() => void start()} disabled={!kinds.length || !sectionIds.length}>
                  <MagicWand className="size-4" /> Run
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewing && reviewing && (
        <div role="region" aria-label="Proposal preview" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-lg">
          <p className="text-sm">
            <span className={cn("mr-2 rounded border-2 border-dashed border-info px-1.5 text-xs font-semibold text-info")}>Proposed</span>
            Previewing {count} change{count === 1 ? "" : "s"} on the timetable.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-9" onClick={() => preview(false)}>Back to review</Button>
            <Button className="h-9" onClick={apply} disabled={applying}>Apply {count}</Button>
          </div>
        </div>
      )}
    </>
  );
}
