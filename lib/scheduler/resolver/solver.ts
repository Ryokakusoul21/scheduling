/**
 * Deterministic repair solver. It turns issues into tasks, works on the hardest first, and tries the least
 * disruptive fix for each (free slot, room only, time only, swap, move one other class). Failed tasks get a
 * bounded local backtrack: recent placements nearby are lifted, the failed task goes first, and they are
 * placed again; the change is kept only if more issues end up fixed. Every candidate passes validatePlacement,
 * so a hard rule is never broken. Same input and options always give the same proposal. Pure and browser-safe.
 */
import { defaultDuration } from "../timetable";
import { isLabRoom } from "../slot-check";
import { rangesOverlap, DAYS } from "../types";
import { softCount, validatePlacement, type Finding } from "../validate";
import { unresolved as explain, type Cause } from "./explain";
import { countIssues, detectIssues, live, plotted, worldOf } from "./issues";
import type { Change, ChangeType, Issue, ProgressStep, Proposal, ResolverEntry, ResolverInput, ResolverOptions, ResolverSection, Unresolved } from "./types";

type Task =
  | { kind: "place"; issue: Issue; section: ResolverSection; subjectId: string; component: "LECTURE" | "LABORATORY"; duration: number }
  | { kind: "relocate"; issue: Issue; entryId: string }
  | { kind: "trim"; issue: Issue; excessMin: number };

interface Candidate {
  changes: Change[];
  soft: number;
}

/** Search state; `state` is the working timetable and `changes` the accepted fixes so far. */
interface Run {
  input: ResolverInput;
  options: ResolverOptions;
  world: ReturnType<typeof worldOf>;
  scope: Set<string>;
  state: Map<string, ResolverEntry>;
  byDay: Map<string, ResolverEntry[]>;
  byFaculty: Map<string, ResolverEntry[]>;
  load: Map<string, number>;
  changes: Change[];
  committed: { group: string; task: Task }[];
  seq: number;
  iterations: number;
  deadline: number;
  now: () => number;
  stopped: boolean;
}

const STATUS_ORDER = { DRAFT: 0, REVIEW: 1, PUBLISHED: 2, ARCHIVED: 3 };

function reindex(run: Run) {
  run.byDay = new Map();
  run.byFaculty = new Map();
  run.load = new Map();
  for (const e of run.state.values()) {
    if (e.status === "ARCHIVED") continue;
    run.byDay.set(e.dayOfWeek, [...(run.byDay.get(e.dayOfWeek) ?? []), e]);
    if (!e.facultyId) continue;
    run.byFaculty.set(e.facultyId, [...(run.byFaculty.get(e.facultyId) ?? []), e]);
    run.load.set(e.facultyId, (run.load.get(e.facultyId) ?? 0) + e.endMin - e.startMin);
  }
}

/** Classes sharing a faculty member, room, or section with `e` at an overlapping time. */
function blockers(run: Run, e: ResolverEntry) {
  return (run.byDay.get(e.dayOfWeek) ?? []).filter(
    (o) => o.id !== e.id && rangesOverlap(o, e) && ((!!e.facultyId && o.facultyId === e.facultyId) || o.roomId === e.roomId || o.sectionId === e.sectionId)
  );
}

function check(run: Run, e: ResolverEntry): Finding[] | null {
  if (++run.iterations > run.options.maxIterations || run.now() > run.deadline) {
    run.stopped = true;
    return null;
  }
  const others = [...new Set([...(run.byDay.get(e.dayOfWeek) ?? []), ...(run.byFaculty.get(e.facultyId) ?? [])])];
  return validatePlacement(e, others, run.world);
}

const nextId = (run: Run, prefix: string) => `${prefix}${++run.seq}`;

function sectionOf(run: Run, id: string) {
  return run.input.sections.find((s) => s.id === id);
}

function subjectOf(run: Run, id: string) {
  return run.input.subjects.find((s) => s.id === id);
}

/** Rooms that can hold the class: right type, enough seats, open to the section's program; exact laboratory type first. */
function roomsFor(run: Run, section: ResolverSection, subjectId: string, component: "LECTURE" | "LABORATORY") {
  const lab = component === "LABORATORY";
  const required = subjectOf(run, subjectId)?.requiredRoomType;
  const exact = lab && required && isLabRoom(required) ? required : null;
  return run.input.rooms
    .filter((r) => r.assignable && r.status === "AVAILABLE" && r.capacity >= section.studentCount)
    .filter((r) => (lab ? isLabRoom(r.roomType) : !isLabRoom(r.roomType) && r.roomType !== "CONFERENCE_ROOM"))
    .filter((r) => !r.programIds || (!!section.programId && r.programIds.includes(section.programId)))
    .sort((a, b) => Number(!!exact && b.roomType === exact) - Number(!!exact && a.roomType === exact) || a.capacity - b.capacity || a.id.localeCompare(b.id));
}

/** The section's current teacher of the subject when assignments are kept; otherwise the least loaded who teach the level. */
function facultyFor(run: Run, section: ResolverSection, subjectId: string) {
  if (run.options.keepFaculty) {
    const current = [...run.state.values()]
      .filter((e) => e.status !== "ARCHIVED" && e.sectionId === section.id && e.subjectId === subjectId && e.facultyId)
      .map((e) => e.facultyId)
      .sort()[0];
    const kept = run.input.faculty.find((f) => f.id === current && f.assignable);
    if (kept) return [kept];
  }
  return run.input.faculty
    .filter((f) => f.assignable && f.teachingLevels.includes(section.level))
    .sort((a, b) => (run.load.get(a.id) ?? 0) - (run.load.get(b.id) ?? 0) || a.id.localeCompare(b.id))
    .slice(0, 4);
}

/** Days with the fewest minutes for the section first, then every start time on the grid. */
function slots(run: Run, sectionId: string, duration: number) {
  const minutes = (day: string) => (run.byDay.get(day) ?? []).filter((e) => e.sectionId === sectionId).reduce((s, e) => s + e.endMin - e.startMin, 0);
  const days = [...DAYS].sort((a, b) => minutes(a) - minutes(b) || DAYS.indexOf(a) - DAYS.indexOf(b));
  const out: { dayOfWeek: (typeof DAYS)[number]; startMin: number }[] = [];
  for (const dayOfWeek of days) for (let s = run.input.bounds.startMin; s + duration <= run.input.bounds.endMin; s += run.input.step) out.push({ dayOfWeek, startMin: s });
  return out;
}

function change(run: Run, type: ChangeType, issue: Issue, group: string, before: ResolverEntry | null, after: ResolverEntry | null, reason: string): Change {
  return { id: nextId(run, "c"), type, issueId: issue.id, group, sectionId: (after ?? before)!.sectionId, before, after, reason };
}

function movedType(before: ResolverEntry, after: ResolverEntry): ChangeType {
  const sameTime = before.dayOfWeek === after.dayOfWeek && before.startMin === after.startMin;
  return sameTime ? "ROOM_CHANGED" : before.roomId === after.roomId ? "TIME_CHANGED" : "MOVED";
}

const valid = (f: Finding[] | null): f is Finding[] => !!f && !f.some((x) => x.hard);

/** Up to `limit` valid placements for a new class, fewest soft problems first. */
function placeCandidates(run: Run, task: Extract<Task, { kind: "place" }>, limit = 3): Candidate[] {
  const found: Candidate[] = [];
  const rooms = roomsFor(run, task.section, task.subjectId, task.component);
  const faculty = facultyFor(run, task.section, task.subjectId);
  for (const slot of slots(run, task.section.id, task.duration)) {
    for (const f of faculty) {
      for (const r of rooms) {
        const e: ResolverEntry = {
          id: `new-${task.issue.id}-${slot.dayOfWeek}-${slot.startMin}-${r.id}`,
          semesterId: task.section.termId, sectionId: task.section.id, subjectId: task.subjectId, facultyId: f.id, roomId: r.id,
          component: task.component, dayOfWeek: slot.dayOfWeek, startMin: slot.startMin, endMin: slot.startMin + task.duration, status: "DRAFT",
        };
        if (blockers(run, e).length) continue;
        const findings = check(run, e);
        if (run.stopped) return found;
        if (!valid(findings)) continue;
        const group = nextId(run, "g");
        found.push({ changes: [change(run, "PLACED", task.issue, group, null, e, `Placed in ${r.roomName}, which seats ${r.capacity}, at a time the section and ${f.fullName} are free.`)], soft: softCount(findings) });
        if (found.filter((c) => c.soft === 0).length >= limit || found.length >= limit * 8) return found.sort((a, b) => a.soft - b.soft).slice(0, limit);
      }
    }
  }
  return found.sort((a, b) => a.soft - b.soft).slice(0, limit);
}

/** Valid new positions for an existing class: same time in another room first, then other times if allowed. */
function relocations(run: Run, entry: ResolverEntry, prefer?: { dayOfWeek: ResolverEntry["dayOfWeek"]; startMin: number }): ResolverEntry[] {
  const section = sectionOf(run, entry.sectionId);
  if (!section) return [];
  const duration = entry.endMin - entry.startMin;
  const rooms = roomsFor(run, section, entry.subjectId, entry.component);
  const tries: ResolverEntry[] = [];
  if (prefer) tries.push({ ...entry, ...prefer, endMin: prefer.startMin + duration });
  tries.push(...rooms.filter((r) => r.id !== entry.roomId).map((r) => ({ ...entry, roomId: r.id })));
  if (run.options.retime) {
    const times = slots(run, entry.sectionId, duration).filter((s) => s.dayOfWeek !== entry.dayOfWeek || s.startMin !== entry.startMin);
    const keepRoom = rooms.some((r) => r.id === entry.roomId);
    for (const s of times) {
      if (keepRoom) tries.push({ ...entry, ...s, endMin: s.startMin + duration });
    }
    for (const s of times) for (const r of rooms) if (r.id !== entry.roomId) tries.push({ ...entry, ...s, endMin: s.startMin + duration, roomId: r.id });
  }
  const out: ResolverEntry[] = [];
  for (const t of tries) {
    if (blockers(run, t).length) continue;
    const findings = check(run, t);
    if (run.stopped) break;
    if (valid(findings) && softCount(findings) === 0) return [...out, t].slice(0, 1);
    if (valid(findings)) out.push(t);
    if (out.length >= 3) break;
  }
  return out.slice(0, 1);
}

/** Temporarily swaps classes in the working timetable, runs `fn`, then restores it. */
function withTemp<T>(run: Run, add: ResolverEntry[], remove: ResolverEntry[], fn: () => T): T {
  const saved = new Map(run.state);
  remove.forEach((e) => run.state.delete(e.id));
  add.forEach((e) => run.state.set(e.id, e));
  reindex(run);
  try {
    return fn();
  } finally {
    run.state = saved;
    reindex(run);
  }
}

/** A class may be moved to make room only in an editable, in-scope section (complete ones only when allowed). */
function movable(run: Run, e: ResolverEntry) {
  const section = sectionOf(run, e.sectionId);
  if (e.busy || !section?.editable || !run.scope.has(e.sectionId)) return false;
  const complete = section.curriculum.every((n) => plotted([...run.state.values()], section.id, n.subjectId, n.component) >= n.requiredMin);
  return !complete || run.options.moveCompleteSections;
}

/** Last resort: a target slot blocked by exactly one movable class, which moves elsewhere (back into our old slot first). */
function displace(run: Run, task: Task, targets: ResolverEntry[], moving?: ResolverEntry): Candidate | null {
  if (!run.options.retime) return null;
  let attempts = 0;
  for (const target of targets) {
    const block = blockers(run, target).filter((b) => b.id !== moving?.id);
    if (block.length !== 1 || !movable(run, block[0])) continue;
    if (++attempts > 25 || run.stopped) return null;
    const b = block[0];
    const found = withTemp(run, [target], moving ? [b, moving] : [b], () => {
      const ok = check(run, target);
      if (!valid(ok)) return null;
      const spot = relocations(run, b, moving ? { dayOfWeek: moving.dayOfWeek, startMin: moving.startMin } : undefined)[0];
      return spot ? { spot, soft: softCount(ok) } : null;
    });
    if (!found) continue;
    const group = nextId(run, "g");
    const label = subjectOf(run, target.subjectId)?.code ?? "another class";
    const main = moving
      ? change(run, movedType(moving, target), task.issue, group, moving, target, "Moved to a free time and room; the class there moves to make room.")
      : change(run, "PLACED", task.issue, group, null, target, "Placed after moving one class out of this slot.");
    const swap = change(run, movedType(b, found.spot), task.issue, group, b, found.spot, `Moved to make room for ${label}.`);
    return { changes: [main, swap], soft: found.soft };
  }
  return null;
}

function commit(run: Run, task: Task, cand: Candidate) {
  for (const c of cand.changes) {
    if (c.after) run.state.set(c.after.id, c.after);
    else if (c.before) run.state.set(c.before.id, { ...c.before, status: "ARCHIVED" });
  }
  run.changes.push(...cand.changes);
  run.committed.push({ group: cand.changes[0].group, task });
  reindex(run);
}

/** Tries one task; returns null on success or the reason it failed. */
function attempt(run: Run, task: Task): Cause | null {
  if (task.kind === "trim") {
    const list = [...run.state.values()]
      .filter((e) => task.issue.entryIds.includes(e.id) && e.status !== "ARCHIVED" && !e.busy)
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || DAYS.indexOf(b.dayOfWeek) - DAYS.indexOf(a.dayOfWeek) || b.startMin - a.startMin);
    let excess = task.excessMin;
    const group = nextId(run, "g");
    const changes: Change[] = [];
    for (const e of list) {
      if (excess <= 0) break;
      const duration = e.endMin - e.startMin;
      if (duration <= excess) {
        changes.push(change(run, "REMOVED", task.issue, group, e, null, "Removed a meeting so the hours match the subject requirement."));
        excess -= duration;
      } else if (duration - excess >= run.input.step) {
        changes.push(change(run, "HOURS_ADJUSTED", task.issue, group, e, { ...e, endMin: e.endMin - excess }, "Shortened so the hours match the subject requirement."));
        excess = 0;
      }
    }
    if (excess > 0 || !changes.length) return "NO_SLOT";
    commit(run, task, { changes, soft: 0 });
    return null;
  }

  if (task.kind === "relocate") {
    const entry = run.state.get(task.entryId);
    if (!entry || entry.status === "ARCHIVED") return null;
    // An earlier fix may already have solved this one.
    const still = check(run, entry);
    if (run.stopped) return "LIMIT";
    if (valid(still)) return null;
    const spot = relocations(run, entry)[0];
    if (run.stopped) return "LIMIT";
    if (spot) {
      const group = nextId(run, "g");
      const reason = task.issue.kind === "ROOM_TYPE" ? "Moved to a laboratory room so the room matches the laboratory component." : "Moved to a free room or time to end the double booking.";
      commit(run, task, { changes: [change(run, movedType(entry, spot), task.issue, group, entry, spot, reason)], soft: 0 });
      return null;
    }
    const section = sectionOf(run, entry.sectionId)!;
    const targets = slots(run, entry.sectionId, entry.endMin - entry.startMin).flatMap((s) =>
      roomsFor(run, section, entry.subjectId, entry.component).map((r) => ({ ...entry, ...s, endMin: s.startMin + entry.endMin - entry.startMin, roomId: r.id }))
    );
    const swap = displace(run, task, targets, entry);
    if (swap) {
      commit(run, task, swap);
      return null;
    }
    return run.stopped ? "LIMIT" : roomsFor(run, section, entry.subjectId, entry.component).length ? "NO_SLOT" : "NO_ROOM";
  }

  const cands = placeCandidates(run, task);
  if (cands[0]) {
    commit(run, task, cands[0]);
    return null;
  }
  if (run.stopped) return "LIMIT";
  const rooms = roomsFor(run, task.section, task.subjectId, task.component);
  const faculty = facultyFor(run, task.section, task.subjectId);
  if (!rooms.length) return "NO_ROOM";
  if (!faculty.length) return "NO_FACULTY";
  const targets = slots(run, task.section.id, task.duration).flatMap((s) =>
    faculty.flatMap((f) =>
      rooms.map((r) => ({
        id: `new-${task.issue.id}-${s.dayOfWeek}-${s.startMin}-${r.id}-${f.id}`, semesterId: task.section.termId, sectionId: task.section.id, subjectId: task.subjectId, facultyId: f.id, roomId: r.id,
        component: task.component, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.startMin + task.duration, status: "DRAFT" as const,
      }))
    )
  );
  const swap = displace(run, task, targets);
  if (swap) {
    commit(run, task, swap);
    return null;
  }
  return run.stopped ? "LIMIT" : "NO_SLOT";
}

/** Lifts up to three recent fixes in the same section, places the failed task first, then puts them back. */
function backtrack(run: Run, task: Task): boolean {
  const sectionId = task.kind === "place" ? task.section.id : task.issue.sectionId;
  const recent = run.committed.filter((c) => c.task.issue.sectionId === sectionId && c.task.kind === "place").slice(-3);
  if (!recent.length) return false;
  const snapshot = { state: new Map(run.state), changes: [...run.changes], committed: [...run.committed] };
  const lifted = new Set(recent.map((r) => r.group));
  for (const c of run.changes.filter((x) => lifted.has(x.group)).reverse()) {
    if (c.before) run.state.set(c.before.id, c.before);
    else if (c.after) run.state.delete(c.after.id);
  }
  run.changes = run.changes.filter((c) => !lifted.has(c.group));
  run.committed = run.committed.filter((c) => !lifted.has(c.group));
  reindex(run);
  const ok = attempt(run, task) === null && recent.every((r) => attempt(run, r.task) === null);
  if (ok) return true;
  run.state = snapshot.state;
  run.changes = snapshot.changes;
  run.committed = snapshot.committed;
  reindex(run);
  return false;
}

/** Turns issues into tasks, hardest first: hour trims, conflicts, room types, then placements (laboratories, scarce faculty, large sections). */
function plan(run: Run, issues: Issue[], unresolved: Unresolved[]): Task[] {
  const { input, options } = run;
  const tasks: Task[] = [];
  const relocating = new Set<string>();
  for (const issue of issues) {
    if (!options.kinds.includes(issue.kind) || (options.issueIds && !options.issueIds.includes(issue.id))) continue;
    const section = sectionOf(run, issue.sectionId);
    if (!section?.editable) {
      unresolved.push(explain(issue, "NOT_EDITABLE", input));
      continue;
    }
    if (issue.kind === "UNSCHEDULED" || (issue.kind === "HOURS" && !issue.dataProblem && issue.subjectId && issue.component)) {
      const subject = subjectOf(run, issue.subjectId!);
      const required = Math.round(((issue.component === "LECTURE" ? subject?.lectureHours : subject?.labHours) ?? 0) * 60);
      const have = plotted([...run.state.values()], section.id, issue.subjectId!, issue.component!);
      if (have < required) {
        let remaining = required - have;
        const chunk = defaultDuration(issue.component!, section.level);
        while (remaining > 0) {
          const duration = Math.min(chunk, remaining);
          tasks.push({ kind: "place", issue, section, subjectId: issue.subjectId!, component: issue.component!, duration });
          remaining -= duration;
        }
        continue;
      }
      if (have > required) tasks.push({ kind: "trim", issue, excessMin: have - required });
      continue;
    }
    if (issue.kind === "HOURS") {
      unresolved.push(explain(issue, "DATA", input));
      continue;
    }
    // Room type and double bookings: move the most changeable class of the pair (drafts before published).
    const mover = issue.entryIds
      .map((id) => run.state.get(id))
      .filter((e): e is ResolverEntry => !!e && !e.busy && run.scope.has(e.sectionId) && !!sectionOf(run, e.sectionId)?.editable)
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.id.localeCompare(a.id))[0];
    if (!mover) {
      unresolved.push(explain(issue, "NOT_EDITABLE", input));
      continue;
    }
    if (relocating.has(mover.id)) continue;
    relocating.add(mover.id);
    tasks.push({ kind: "relocate", issue, entryId: mover.id });
  }

  const faculty = new Map(input.faculty.map((f) => [f.id, f]));
  const windowMinutes = (task: Task) => {
    if (task.kind !== "place") return 0;
    const kept = run.options.keepFaculty ? facultyFor(run, task.section, task.subjectId) : [];
    const f = kept.length === 1 ? faculty.get(kept[0].id) : undefined;
    return f?.availability.length ? f.availability.reduce((s, w) => s + w.endMin - w.startMin, 0) : Infinity;
  };
  const rank = (t: Task) => (t.kind === "trim" ? 0 : t.kind === "relocate" ? (t.issue.kind === "CONFLICT" ? 1 : 2) : 3);
  return tasks.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.kind !== "place" || b.kind !== "place") return a.issue.id.localeCompare(b.issue.id);
    return (
      Number(b.component === "LABORATORY") - Number(a.component === "LABORATORY") ||
      windowMinutes(a) - windowMinutes(b) ||
      b.section.studentCount - a.section.studentCount ||
      b.duration - a.duration ||
      a.issue.id.localeCompare(b.issue.id)
    );
  });
}

const STEP_OF: Record<string, ProgressStep> = { trim: "Adjusting hours", CONFLICT: "Resolving conflicts", ROOM_TYPE: "Fixing room types", LABORATORY: "Placing laboratory classes", LECTURE: "Placing lecture classes" };

/** Builds a repair proposal. `onProgress` reports the current step; `now` is injectable for tests. */
export function solve(input: ResolverInput, options: ResolverOptions, onProgress?: (step: ProgressStep, done: number, total: number) => void, now: () => number = () => Date.now()): Proposal {
  const scope = new Set(options.sectionIds);
  const world = worldOf(input);
  const run: Run = {
    input, options, world, scope,
    state: new Map(input.entries.map((e) => [e.id, e])),
    byDay: new Map(), byFaculty: new Map(), load: new Map(),
    changes: [], committed: [], seq: 0, iterations: 0, deadline: now() + options.timeLimitMs, now, stopped: false,
  };
  reindex(run);

  onProgress?.("Finding issues", 0, 1);
  const issues = detectIssues(input, input.entries, scope, world);
  const unresolved: Unresolved[] = [];
  const tasks = plan(run, issues, unresolved);

  const failed: { task: Task; cause: Cause }[] = [];
  tasks.forEach((task, i) => {
    onProgress?.(task.kind === "trim" ? STEP_OF.trim : task.kind === "relocate" ? STEP_OF[task.issue.kind] : STEP_OF[task.component], i, tasks.length);
    const cause = run.stopped ? "LIMIT" : attempt(run, task);
    if (cause) failed.push({ task, cause });
  });

  onProgress?.("Improving the proposal", tasks.length, tasks.length);
  const stillFailed = failed.filter((f) => run.stopped || f.cause === "LIMIT" || !backtrack(run, f.task));

  // One entry per issue, with the first reason it failed.
  for (const f of stillFailed) if (!unresolved.some((u) => u.issue.id === f.task.issue.id)) unresolved.push(explain(f.task.issue, f.cause, input));

  const final = [...run.state.values()];
  const liveFinal = live(final);
  const moved = run.changes.filter((c) => c.before && c.after);
  const facultyAffected = new Set(run.changes.flatMap((c) => [c.before?.facultyId, c.after?.facultyId]).filter(Boolean));
  const softViolations = run.changes.reduce((s, c) => s + (c.after ? softCount(validatePlacement(c.after, liveFinal, world)) : 0), 0);
  onProgress?.("Done", tasks.length, tasks.length);

  return {
    changes: run.changes,
    unresolved,
    before: countIssues(input, input.entries, scope, world),
    after: countIssues(input, final, scope, world),
    classesMoved: new Set(moved.map((c) => c.before!.id)).size,
    facultyAffected: facultyAffected.size,
    softViolations,
    stoppedEarly: run.stopped,
    iterations: run.iterations,
  };
}
