"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, MagnifyingGlass, Warning } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { FacultyLoadBar } from "@/components/subjects/faculty-load-bar";
import { NativeSelect } from "@/components/ux/native-select";
import { cn } from "@/lib/utils";
import { ConflictAlert, ConflictTag } from "@/components/ux/conflict";
import { assignmentWarnings, type AssignableFaculty } from "@/lib/subjects/assignment-rules";
import { specializationMatch } from "@/lib/subjects/match";
import { projectedLoads, type PlanChange } from "@/lib/subjects/plan";
import { assignmentConflictsAction, saveAssignmentPlanAction, subjectDetailsAction } from "./assignment-actions";
import type { AssignContext, SubjectInfo } from "./types";

const EMPLOYMENT = { FULL_TIME: "Full-time", PART_TIME: "Part-time" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

/** Assign, replace, or remove teachers for one or more subjects: pick sections, pick faculty, review, then save. */
export function AssignFacultyModal({ subjects, context, onClose }: { subjects: SubjectInfo[]; context: AssignContext; onClose: (saved: boolean) => void }) {
  const { faculty, measure, sections, term } = context;
  const unit = measure === "HOURS" ? "hrs" : "units";
  const single = subjects.length === 1 ? subjects[0] : null;
  const keys = useMemo(() => [{ key: "", name: "All sections" }, ...sections.map((s) => ({ key: s.id, name: s.name }))], [sections]);
  const nameOf = (key: string) => keys.find((k) => k.key === key)?.name ?? "Section";
  const people = useMemo(() => new Map(faculty.map((f) => [f.id, f])), [faculty]);

  const [plan, setPlan] = useState<Map<string, string | null>>(new Map());
  const [target, setTarget] = useState<Set<string>>(new Set([""]));
  const [filters, setFilters] = useState({ query: "", department: "", employment: "", available: false, matches: false });
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Map<string, string[]>>(new Map());
  const [last, setLast] = useState<{ who: string; at: string } | null>(null);
  const [pending, start] = useTransition();

  const changes: PlanChange[] = useMemo(() => [...plan].map(([key, facultyId]) => ({ sectionId: key || null, facultyId })), [plan]);
  const subjectIds = useMemo(() => subjects.map((s) => s.id), [subjects]);
  const loads = useMemo(() => projectedLoads(faculty, subjects, changes, measure), [faculty, subjects, changes, measure]);

  useEffect(() => {
    if (!single) return;
    let live = true;
    subjectDetailsAction(single.id, term.id).then((d) => live && d?.history[0] && setLast({ who: d.history[0].who, at: d.history[0].at }));
    return () => { live = false; };
  }, [single, term.id]);

  // Checks each chosen teacher against the subject's scheduled class times.
  useEffect(() => {
    let live = true;
    const picks = changes.filter((c) => c.facultyId);
    Promise.all(picks.map(async (c) => [`${c.facultyId}|${c.sectionId ?? ""}`, await assignmentConflictsAction({ subjectIds, semesterId: term.id, facultyId: c.facultyId!, sectionId: c.sectionId })] as const))
      .then((rows) => live && setConflicts(new Map(rows.filter(([, list]) => list.length))));
    return () => { live = false; };
  }, [changes, subjectIds, term.id]);

  const current = (key: string) => (single ? single.assignments.find((a) => (a.sectionId ?? "") === key) ?? null : null);
  const coveredCount = (key: string) => subjects.filter((s) => s.assignments.some((a) => (a.sectionId ?? "") === key)).length;
  const effective = (key: string) => (plan.has(key) ? plan.get(key) ?? null : current(key)?.facultyId ?? null);

  /** "All sections" excludes specific ones, and picking a specific section clears "All sections". */
  function toggleSection(key: string) {
    setTarget((prev) => {
      if (key === "") return prev.has("") ? new Set() : new Set([""]);
      const next = new Set(prev);
      next.delete("");
      if (prev.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function assign(facultyId: string) {
    setPlan((prev) => new Map([...prev, ...[...target].map((k) => [k, facultyId] as const)]));
    setTarget(new Set());
  }

  function removeTeacher(facultyId: string) {
    const held = subjects.flatMap((s) => s.assignments.filter((a) => a.facultyId === facultyId).map((a) => a.sectionId ?? ""));
    setPlan((prev) => new Map([...prev, ...[...new Set(held)].map((k) => [k, null] as const)]));
  }

  function replaceTeacher(facultyId: string) {
    const held = subjects.flatMap((s) => s.assignments.filter((a) => a.facultyId === facultyId).map((a) => a.sectionId ?? ""));
    setTarget(new Set(held));
    document.getElementById("faculty-search")?.focus();
  }

  const undo = (key: string) => setPlan((prev) => { const next = new Map(prev); next.delete(key); return next; });

  const matchOf = (f: AssignableFaculty) => subjects.some((s) => specializationMatch(f.specialization, s));
  const departments = [...new Map(faculty.map((f) => [f.departmentId ?? "", f.departmentName])).entries()];
  const shown = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return faculty
      .filter((f) => (!q || `${f.name} ${f.departmentName} ${f.specialization ?? ""}`.toLowerCase().includes(q)) && (!filters.department || (f.departmentId ?? "") === filters.department) && (!filters.employment || f.employmentType === filters.employment) && (!filters.available || f.load < f.limit) && (!filters.matches || matchOf(f)))
      .sort((a, b) => Number(matchOf(b)) - Number(matchOf(a)) || a.load / a.limit - b.load / b.limit || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faculty, filters, subjects]);

  const currentTeachers = [...subjects.flatMap((s) => s.assignments).reduce((m, a) => m.set(a.facultyId, [...(m.get(a.facultyId) ?? []), a]), new Map<string, SubjectInfo["assignments"]>())];
  const plannedTo = (id: string) => [...plan].filter(([, f]) => f === id).map(([k]) => nameOf(k));
  const overLimit = [...loads].filter(([, l]) => l.after > l.limit && l.after > l.before).map(([id]) => people.get(id)!);
  const reviewWarnings = [...new Set(changes.flatMap((c) => (c.facultyId ? [c.facultyId] : [])))].flatMap((id) => assignmentWarnings(people.get(id)!, subjects, measure));
  const allConflicts = [...conflicts.values()].flat();
  const exceeds = (f: AssignableFaculty) => { const l = loads.get(f.id); return l ? l.after > l.limit : false; };

  function save() {
    setError(null);
    start(async () => {
      const result = await saveAssignmentPlanAction({ subjectIds, semesterId: term.id, changes });
      if (!result.ok) return setError(result.error);
      toast.success(result.changed ? `${result.changed} assignment${result.changed > 1 ? "s" : ""} saved.` : "No changes needed.");
      result.warnings.forEach((w) => toast.warning(w));
      onClose(true);
    });
  }

  const title = single ? `${single.assignments.length ? "Reassign" : "Assign"} ${single.code}` : `Assign ${subjects.length} subjects`;
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose(false)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-sm">
            {single ? `${single.name} · ${single.units} units · ${single.lectureHours + single.labHours} hrs/week` : subjects.map((s) => s.code).join(", ")} · {term.label}
          </DialogDescription>
          {last && <p className="text-sm text-muted-foreground">Last updated by {last.who} on {when(last.at)}</p>}
        </DialogHeader>

        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
        {step === "edit" ? (
          <div className="space-y-5">
            <div className="space-y-5">
              <section aria-labelledby="sec-h" className="space-y-2">
                <h3 id="sec-h" className="text-sm font-semibold">1. Choose sections</h3>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {keys.map(({ key, name }) => {
                    const cur = current(key);
                    const planned = plan.has(key);
                    const to = effective(key);
                    return (
                      <li key={key || "all"}>
                        <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border bg-card p-2 text-sm transition-colors", target.has(key) ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted")}>
                          <input type="checkbox" checked={target.has(key)} onChange={() => toggleSection(key)} className="mt-0.5 size-4 accent-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{name}</span>
                            <span className="block text-sm text-muted-foreground">
                              {planned ? (
                                <span className="inline-flex flex-wrap items-center gap-1 font-medium text-primary">
                                  <ArrowRight className="size-3.5" aria-hidden /> {to ? people.get(to)?.name : "Teacher removed"}
                                  <button type="button" onClick={(e) => { e.preventDefault(); undo(key); }} className="ml-1 rounded text-sm font-normal underline outline-none focus-visible:ring-2 focus-visible:ring-ring">Undo</button>
                                </span>
                              ) : single ? (cur ? cur.facultyName : <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><Warning className="size-3.5" aria-hidden /> No teacher yet</span>) : `${coveredCount(key)} of ${subjects.length} have a teacher`}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="cur-h" className="space-y-2">
                <h3 id="cur-h" className="text-sm font-semibold">Currently assigned</h3>
                {currentTeachers.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Nobody is assigned yet.</p> : (
                  <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {currentTeachers.map(([id, rows]) => {
                      const f = people.get(id);
                      const gone = [...new Set(rows.map((r) => r.sectionId ?? ""))].every((k) => plan.has(k) && plan.get(k) !== id);
                      return (
                        <li key={id} className={cn("space-y-1.5 rounded-lg border bg-card p-2", gone && "opacity-60")}>
                          <div className="flex items-start gap-2">
                            <UserAvatar name={rows[0].facultyName} className="size-8 text-xs" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{rows[0].facultyName}</p>
                              <p className="line-clamp-1 text-sm text-muted-foreground">{[...new Set(rows.map((r) => r.sectionName ?? "All sections"))].join(", ")}</p>
                            </div>
                          </div>
                          {f && <FacultyLoadBar load={f.load} limit={f.limit} after={loads.get(id)?.after} unit={unit} />}
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => replaceTeacher(id)}>Replace</Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => removeTeacher(id)} disabled={gone}>Remove</Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <section aria-labelledby="fac-h" className="min-w-0 space-y-3 border-t pt-4">
              <h3 id="fac-h" className="text-sm font-semibold">2. Choose faculty {target.size === 0 && <span className="font-normal text-muted-foreground">(select sections first)</span>}</h3>
              <label className="relative block">
                <span className="sr-only">Search faculty</span>
                <MagnifyingGlass className="absolute left-2.5 top-3 size-4 text-muted-foreground" aria-hidden />
                <Input id="faculty-search" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} placeholder="Search name, department, or specialization" className="h-10 pl-8 md:text-base" />
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <NativeSelect aria-label="Department" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} options={[{ value: "", label: "All departments" }, ...departments.map(([value, label]) => ({ value, label }))]} />
                <NativeSelect aria-label="Employment type" value={filters.employment} onChange={(e) => setFilters({ ...filters, employment: e.target.value })} options={[{ value: "", label: "Any employment" }, { value: "FULL_TIME", label: "Full-time" }, { value: "PART_TIME", label: "Part-time" }]} />
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={filters.available} onChange={(e) => setFilters({ ...filters, available: e.target.checked })} className="size-4 accent-primary" /> Available only</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={filters.matches} onChange={(e) => setFilters({ ...filters, matches: e.target.checked })} className="size-4 accent-primary" /> Matches specialization</label>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 lg:max-h-[26rem] lg:overflow-y-auto lg:pr-1" aria-label="Available faculty">
                {shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">No faculty match these filters.</li>}
                {shown.map((f) => {
                  const l = loads.get(f.id);
                  const planned = plannedTo(f.id);
                  const hasConflict = [...conflicts.keys()].some((k) => k.startsWith(`${f.id}|`));
                  return (
                    <li key={f.id}>
                      <button type="button" disabled={target.size === 0} onClick={() => assign(f.id)} className={cn("flex h-full w-full items-start gap-3 rounded-lg border p-3 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60", planned.length > 0 && "border-primary bg-primary/5")}>
                        <UserAvatar name={f.name} className="size-9 text-xs" />
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{f.name}</span>
                            {matchOf(f) && <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">Matches subject</Badge>}
                            {planned.length > 0 && <Badge>Selected for {planned.join(", ")}</Badge>}
                          </span>
                          <span className="block text-sm text-muted-foreground">{f.departmentName} · {EMPLOYMENT[f.employmentType]}{f.specialization ? ` · ${f.specialization}` : ""}</span>
                          {f.unavailability.length > 0 && <span className="flex items-start gap-1 text-sm text-amber-700 dark:text-amber-400"><Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Reported unavailable: {f.unavailability.join("; ")}</span>}
                          {hasConflict && <span className="flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400"><ConflictTag /> Class time overlap. See the review step.</span>}
                          {exceeds(f) && <span className="block text-sm font-medium text-red-700 dark:text-red-400">Would exceed the maximum load</span>}
                          <FacultyLoadBar load={f.load} limit={f.limit} after={l?.after} unit={unit} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        ) : (
          <div className="space-y-4" aria-live="polite">
            <h3 className="text-sm font-semibold">Review changes</h3>
            <ul className="divide-y rounded-lg border text-sm">
              {changes.map((c) => {
                const before = [...new Set(subjects.flatMap((s) => s.assignments.filter((a) => (a.sectionId ?? "") === (c.sectionId ?? "")).map((a) => a.facultyName)))];
                return (
                  <li key={c.sectionId ?? "all"} className="flex flex-wrap items-center gap-2 p-3">
                    <span className="font-medium">{single ? `${single.code} · ` : `${subjects.length} subjects · `}{nameOf(c.sectionId ?? "")}</span>
                    <span className="text-muted-foreground">{before.join(", ") || "No teacher"}</span>
                    <ArrowRight className="size-4" aria-hidden />
                    <span className={cn("font-medium", !c.facultyId && "text-destructive")}>{c.facultyId ? people.get(c.facultyId)?.name : "Removed"}</span>
                  </li>
                );
              })}
            </ul>
            {loads.size > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {[...loads].map(([id]) => <div key={id} className="space-y-1 rounded-lg border p-3"><p className="text-sm font-medium">{people.get(id)?.name}</p><FacultyLoadBar load={people.get(id)!.load} limit={people.get(id)!.limit} after={loads.get(id)!.after} unit={unit} /></div>)}
              </div>
            )}
            {allConflicts.length > 0 && <ConflictAlert title="Class time conflicts" items={allConflicts} />}
            {reviewWarnings.length > 0 && <ConflictAlert severity="warning" title="Check before saving" items={reviewWarnings} />}
            {overLimit.length > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-red-600" />
                <span>{overLimit.map((f) => f.name).join(", ")} would go over the maximum load. I understand and want to continue.</span>
              </label>
            )}
          </div>
        )}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="self-center text-sm text-muted-foreground">{changes.length ? `${changes.length} change${changes.length > 1 ? "s" : ""} to save` : "No changes yet"}</p>
          <div className="flex gap-2">
            {step === "review" ? <Button variant="outline" disabled={pending} onClick={() => setStep("edit")}>Back</Button> : <Button variant="outline" onClick={() => onClose(false)}>Cancel</Button>}
            {step === "edit"
              ? <Button disabled={!changes.length} onClick={() => { setAck(false); setStep("review"); }}>Review changes</Button>
              : <Button disabled={pending || (overLimit.length > 0 && !ack)} onClick={save}>{pending ? "Saving..." : "Confirm and save"}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
