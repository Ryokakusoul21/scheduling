"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowsOutCardinal, CalendarX, ChalkboardTeacher, CircleNotch, Clock, Door, Eye, Hourglass, MagicWand, WarningCircle } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DialogHero, Fact, LEGEND, Segmented, ToggleCard } from "./process-dialog-parts";
import { checkSelection } from "@/lib/scheduler/resolver/changes";
import { summaryFacts, templateSummary } from "@/lib/scheduler/resolver/explain";
import { DEFAULT_OPTIONS, ISSUE_KINDS, type Change, type IssueCounts, type IssueKind, type Proposal, type ResolverEntry, type ResolverInput } from "@/lib/scheduler/resolver/types";
import { applyRepairAction, narrateRepairAction, repairStampAction, undoRepairAction } from "@/app/(dashboard)/scheduler/resolve-actions";
import { cn } from "@/lib/utils";
import { ProcessAnimation } from "./process-animation";
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
  HOURS: "Hours mismatches",
  ROOM_TYPE: "Room type mismatches",
  CONFLICT: "Double bookings",
};
const KIND_ICONS = { UNSCHEDULED: CalendarX, HOURS: Hourglass, ROOM_TYPE: Door, CONFLICT: WarningCircle } satisfies Record<IssueKind, unknown>;

const STAGES = ["Find issues", "Fix", "Improve"];
const MIN_RUN_MS = 1200;

type Phase ={ name: "options" } | { name: "review"; proposal: Proposal; base: ResolverEntry[]; generatedAt: string };

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
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  const sectionIds = scope === "filter" ? filterSectionIds : scope === "selected" ? selected : (request?.sectionIds ?? filterSectionIds);
  const options = { ...DEFAULT_OPTIONS, sectionIds, issueIds: scope === "issue" && request?.issueId ? [request.issueId] : undefined, kinds, keepFaculty: true, moveCompleteSections: moveComplete, retime };

  async function start() {
    const input = buildInput();
    const stamp = await repairStampAction();
    if (!stamp.ok) return void toast.error(stamp.error);
    setAnnouncement("Looking for fixes.");
    const id = ++runId.current;
    const began = Date.now();
    setBusy(true);
    const proposal = await run(input, options);
    // Hold briefly so the process animation is seen even when the solver is instant.
    if (proposal) await new Promise((r) => setTimeout(r, Math.max(0, MIN_RUN_MS - (Date.now() - began))));
    if (runId.current !== id) return;
    setBusy(false);
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

  /** Cancels a run, including one waiting out the animation hold. */
  function stop() {
    runId.current++;
    setBusy(false);
    cancel();
    setAnnouncement("Cancelled.");
  }

  function close() {
    stop();
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

  const reviewing = phase.name === "review";
  const count = reviewing ? accepted.size : 0;

  return (
    <>
      <p aria-live="polite" className="sr-only">{progress ? `${progress.step}…` : announcement}</p>
      <Dialog open={!!request && !previewing} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHero icon={MagicWand} title="Resolve issues" description={reviewing ? "Review the proposal. Nothing changes until you apply." : "Proposes safe fixes for you to review."} />

          {busy ? (
            <ProcessAnimation
              stages={STAGES}
              active={!progress ? STAGES.length : progress.step === "Finding issues" ? 0 : progress.step === "Improving the proposal" || progress.step === "Done" ? 2 : 1}
              label={progress ? `${progress.step}…` : "Proposal ready"}
              percent={!progress ? 100 : progress.total ? Math.round((progress.done / progress.total) * 100) : 0}
              detail={progress ? `${progress.done} of ${progress.total}` : undefined}
            />
          ) : reviewing ? (
            <ResolveReview proposal={phase.proposal} counts={counts ?? phase.proposal.after} summary={summary} aiPending={aiPending} accepted={accepted} onToggle={toggle} labels={labels} />
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Segmented
                  name="resolve-scope"
                  legend="Scope"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: "filter", label: "All sections", count: filterSectionIds.length },
                    { value: "selected", label: "Selected", count: scope === "selected" ? selected.length : undefined },
                    ...(request?.issueId ? [{ value: "issue" as const, label: "This issue" }] : []),
                  ]}
                />
                {scope === "issue" && request?.issueLabel && <p className="text-xs text-muted-foreground">{request.issueLabel}</p>}
                {scope === "selected" && (
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-2" role="group" aria-label="Sections">
                    {filterSectionIds.map((id) => (
                      <label key={id} className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring", selected.includes(id) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                        <input type="checkbox" className="sr-only" checked={selected.includes(id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id)))} />
                        {labels.section(id)}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <fieldset>
                <legend className={LEGEND}>Fix</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ISSUE_KINDS.map((k) => <ToggleCard key={k} icon={KIND_ICONS[k]} label={KIND_LABELS[k]} checked={kinds.includes(k)} onChange={(v) => setKinds((list) => (v ? [...list, k] : list.filter((x) => x !== k)))} />)}
                </div>
              </fieldset>
              <fieldset>
                <legend className={LEGEND}>Allow</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleCard icon={ArrowsOutCardinal} label="Move complete sections" hint="Frees room for other classes" checked={moveComplete} onChange={setMoveComplete} />
                  <ToggleCard icon={Clock} label="Change class times" hint="Off: rooms only" checked={retime} onChange={setRetime} />
                </div>
              </fieldset>
              <Fact icon={ChalkboardTeacher}>Assigned teachers are kept</Fact>
            </div>
          )}

          <DialogFooter className="gap-2">
            {busy ? (
              <Button variant="outline" onClick={stop}>Cancel</Button>
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
