/**
 * Faculty Workload Optimization. Teaching load is balanced by moving whole assignments
 * (every meeting of one subject for one section) from overloaded faculty to faculty with room,
 * preferring underloaded colleagues in the same department whose specialization matches; crossing
 * departments requires a matching specialization.
 * A move is only proposed when the receiver teaches the level, is available and free at every
 * meeting time, and stays within the limits. Pure and deterministic (tests/workload.test.ts).
 */
import { rangesOverlap, type DayOfWeek } from "@/lib/scheduler/types";

export interface WorkloadLimits {
  measure: "HOURS" | "UNITS";
  minimum: number;
  maximum: number;
}

export interface WMeeting {
  scheduleId: string;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
}

/** One subject taught to one section by one faculty member. */
export interface Assignment {
  key: string;
  facultyId: string;
  subjectName: string;
  subjectUnits: number;
  sectionName: string;
  sectionLevel: string;
  departmentId: string | null;
  meetings: WMeeting[];
}

export interface WFaculty {
  id: string;
  name: string;
  departmentId: string | null;
  specialization: string | null;
  teachingLevels: string[];
  /** Personal cap in weekly hours; the effective maximum is the lower of this and the global limit. */
  maxHours: number;
  availability: { dayOfWeek: DayOfWeek; startMin: number; endMin: number }[];
}

export interface Move {
  key: string;
  scheduleIds: string[];
  label: string;
  fromFacultyId: string;
  toFacultyId: string;
  amount: number;
  /** Loads of both faculty members before and after this move. */
  fromBefore: number;
  fromAfter: number;
  toBefore: number;
  toAfter: number;
  reason: string;
}

/** Something the optimizer could not fix safely and a person must look at. */
export interface Flag {
  kind: "OVERLOADED" | "UNDERLOADED" | "UNASSIGNED" | "NOT_APPLIED";
  facultyId: string | null;
  label: string;
  explanation: string;
}

export interface OptimizeOptions {
  /** Assignments a person kept in place by undoing a fix or rejecting a proposal; they are never moved automatically. */
  blocked?: Set<string>;
  /** Classes whose faculty member is inactive or on leave; they must move to someone qualified. */
  unassigned?: Assignment[];
  /** Names of the inactive faculty owning `unassigned` classes, for explanations. */
  inactiveNames?: Map<string, string>;
}

export type LoadStatus = "UNDERLOADED" | "BALANCED" | "OVERLOADED";

export interface LoadRow {
  facultyId: string;
  name: string;
  load: number;
  minimum: number;
  maximum: number;
  status: LoadStatus;
}

const hoursOf = (a: Assignment) => a.meetings.reduce((s, m) => s + (m.endMin - m.startMin), 0) / 60;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function amountOf(a: Assignment, limits: WorkloadLimits) {
  return limits.measure === "HOURS" ? round1(hoursOf(a)) : a.subjectUnits;
}

export function maximumFor(f: WFaculty, limits: WorkloadLimits) {
  return limits.measure === "HOURS" ? Math.min(limits.maximum, f.maxHours) : limits.maximum;
}

export function statusOf(load: number, minimum: number, maximum: number): LoadStatus {
  return load > maximum ? "OVERLOADED" : load < minimum ? "UNDERLOADED" : "BALANCED";
}

/** Current load of every faculty member against the minimum and their maximum. */
export function loadReport(faculty: WFaculty[], assignments: Assignment[], limits: WorkloadLimits): LoadRow[] {
  return faculty.map((f) => {
    const load = round1(assignments.filter((a) => a.facultyId === f.id).reduce((s, a) => s + amountOf(a, limits), 0));
    const maximum = maximumFor(f, limits);
    return { facultyId: f.id, name: f.name, load, minimum: limits.minimum, maximum, status: statusOf(load, limits.minimum, maximum) };
  });
}

function specializationMatch(f: WFaculty, a: Assignment) {
  const words = (f.specialization ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && w !== "and");
  const subject = a.subjectName.toLowerCase();
  return words.some((w) => subject.includes(w));
}

/**
 * Proposes moves until nobody is overloaded and underloaded faculty have been topped up
 * where a compatible class exists. `busy` holds every meeting each faculty member already
 * teaches (all departments), so receivers are never double-booked. Anything that cannot be
 * fixed without breaking a rule is returned as a flag with an explanation.
 */
export function optimize(faculty: WFaculty[], assignments: Assignment[], limits: WorkloadLimits, busy: Map<string, WMeeting[]>, opts: OptimizeOptions = {}) {
  const byId = new Map(faculty.map((f) => [f.id, f]));
  const unassigned = opts.unassigned ?? [];
  assignments = [...assignments, ...unassigned];
  const owner = new Map(assignments.map((a) => [a.key, a.facultyId]));
  const nameOf = (id: string) => byId.get(id)?.name ?? opts.inactiveNames?.get(id) ?? "An inactive faculty member";
  const unit = limits.measure === "HOURS" ? "hours" : "units";
  const flags: Flag[] = [];
  const load = new Map(loadReport(faculty, assignments, limits).map((r) => [r.facultyId, r.load]));
  const schedule = new Map([...busy.entries()].map(([k, v]) => [k, [...v]]));
  const max = (id: string) => maximumFor(byId.get(id)!, limits);
  const moves: Move[] = [];
  const moved = new Set<string>();

  const canTake = (f: WFaculty, a: Assignment) =>
    a.sectionLevel !== "" && f.teachingLevels.includes(a.sectionLevel) &&
    a.meetings.every((m) =>
      (f.availability.length === 0 || f.availability.some((w) => w.dayOfWeek === m.dayOfWeek && m.startMin >= w.startMin && m.endMin <= w.endMin)) &&
      !(schedule.get(f.id) ?? []).some((b) => b.dayOfWeek === m.dayOfWeek && rangesOverlap(b, m))
    );

  function bestMove(donorId: string, receivers: WFaculty[], keepDonorAtLeast: number) {
    let best: { a: Assignment; r: WFaculty; score: number } | null = null;
    for (const a of assignments) {
      if (owner.get(a.key) !== donorId || moved.has(a.key) || opts.blocked?.has(a.key)) continue;
      const amount = amountOf(a, limits);
      if ((load.get(donorId) ?? 0) - amount < keepDonorAtLeast) continue;
      const home = a.departmentId ?? byId.get(donorId)?.departmentId;
      for (const r of receivers) {
        if (r.id === donorId) continue;
        if ((load.get(r.id) ?? 0) + amount > max(r.id) || !canTake(r, a)) continue;
        // Qualified means the same department, or a matching specialization when crossing departments.
        const sameDepartment = !!r.departmentId && r.departmentId === home;
        if (!sameDepartment && !specializationMatch(r, a)) continue;
        const after = (load.get(r.id) ?? 0) + amount;
        const score =
          ((load.get(r.id) ?? 0) < limits.minimum ? 4 : 0) +
          (sameDepartment ? 3 : 0) +
          (specializationMatch(r, a) ? 2 : 0) -
          Math.abs(after - (limits.minimum + max(r.id)) / 2) / 10;
        if (!best || score > best.score) best = { a, r, score };
      }
    }
    return best;
  }

  function apply(donorId: string, a: Assignment, r: WFaculty, why: string) {
    const amount = amountOf(a, limits);
    const donor = byId.get(donorId) ?? { name: nameOf(donorId), departmentId: a.departmentId };
    const before = { d: load.get(donorId) ?? 0, r: load.get(r.id) ?? 0 };
    load.set(donorId, round1(before.d - amount));
    load.set(r.id, round1(before.r + amount));
    owner.set(a.key, r.id);
    moved.add(a.key);
    schedule.set(r.id, [...(schedule.get(r.id) ?? []), ...a.meetings]);
    schedule.set(donorId, (schedule.get(donorId) ?? []).filter((m) => !a.meetings.some((x) => x.scheduleId === m.scheduleId)));
    const traits = [
      r.departmentId && r.departmentId === (a.departmentId ?? donor.departmentId) ? "same department" : "another department",
      specializationMatch(r, a) ? `specialization in ${r.specialization}` : null,
      "available and free at every meeting time",
    ].filter(Boolean).join(", ");
    moves.push({
      key: a.key,
      scheduleIds: a.meetings.map((m) => m.scheduleId),
      label: `${a.subjectName}, ${a.sectionName}`,
      fromFacultyId: donorId,
      toFacultyId: r.id,
      amount,
      fromBefore: before.d,
      fromAfter: round1(before.d - amount),
      toBefore: before.r,
      toAfter: round1(before.r + amount),
      reason: `${why} Moves ${amount} ${unit} from ${donor.name} (${before.d} to ${round1(before.d - amount)} ${unit}) to ${r.name} (${before.r} to ${round1(before.r + amount)} ${unit}): ${traits}.`,
    });
  }

  const sortedReceivers = () => [...faculty].sort((x, y) => (load.get(x.id) ?? 0) - (load.get(y.id) ?? 0));
  const measureWord = limits.measure === "HOURS" ? "hour" : "unit";

  // Phase 0: classes of inactive or on-leave faculty must go to a qualified, free colleague.
  for (const donorId of new Set(unassigned.map((a) => a.facultyId))) {
    for (let guard = 0; guard < 100; guard++) {
      const m = bestMove(donorId, sortedReceivers(), -Infinity);
      if (!m) break;
      apply(donorId, m.a, m.r, `${nameOf(donorId)} is no longer active.`);
    }
  }
  for (const a of unassigned.filter((x) => !moved.has(x.key))) {
    flags.push({
      kind: "UNASSIGNED",
      facultyId: null,
      label: `${a.subjectName}, ${a.sectionName}`,
      explanation: `${nameOf(a.facultyId)} is no longer active, and no qualified faculty member is free at every meeting time within the maximum load. Assign it manually or add a faculty member.`,
    });
    moved.add(a.key);
  }

  // Phase 1: bring every overloaded faculty member down to their maximum.
  const stuck = new Set<string>();
  for (let guard = 0; guard < 200; guard++) {
    const donor = [...faculty]
      .filter((f) => !stuck.has(f.id) && (load.get(f.id) ?? 0) > max(f.id))
      .sort((x, y) => (load.get(y.id) ?? 0) - max(y.id) - ((load.get(x.id) ?? 0) - max(x.id)))[0];
    if (!donor) break;
    const m = bestMove(donor.id, sortedReceivers(), 0);
    if (!m) stuck.add(donor.id);
    else apply(donor.id, m.a, m.r, `${donor.name} is over the ${max(donor.id)}-${measureWord} maximum.`);
  }

  // Phase 2: top up underloaded faculty from colleagues who stay at or above the minimum.
  for (let guard = 0; guard < 200; guard++) {
    let done = false;
    for (const r of sortedReceivers().filter((f) => (load.get(f.id) ?? 0) < limits.minimum)) {
      const donors = [...faculty].filter((f) => f.id !== r.id && (load.get(f.id) ?? 0) > limits.minimum).sort((x, y) => (load.get(y.id) ?? 0) - (load.get(x.id) ?? 0));
      const found = donors.map((d) => ({ d, m: bestMove(d.id, [r], limits.minimum) })).find((x) => x.m);
      if (found) {
        apply(found.d.id, found.m!.a, r, `${r.name} is under the ${limits.minimum}-${limits.measure === "HOURS" ? "hour" : "unit"} minimum.`);
        done = true;
        break;
      }
    }
    if (!done) break;
  }

  const after = faculty.map((f) => ({ id: f.id, status: statusOf(load.get(f.id) ?? 0, limits.minimum, max(f.id)) }));
  for (const f of faculty) {
    const l = load.get(f.id) ?? 0;
    if (l > max(f.id)) {
      flags.push({
        kind: "OVERLOADED", facultyId: f.id, label: f.name,
        explanation: `${f.name} stays at ${l} ${unit} (maximum ${max(f.id)}): no qualified colleague is available and free at the class times without exceeding their own maximum${assignments.some((a) => owner.get(a.key) === f.id && opts.blocked?.has(a.key)) ? ", or the remaining classes were kept in place when a fix was undone or a proposal rejected" : ""}.`,
      });
    } else if (l < limits.minimum) {
      flags.push({
        kind: "UNDERLOADED", facultyId: f.id, label: f.name,
        explanation: `${f.name} stays at ${l} ${unit} (minimum ${limits.minimum}): no class they are qualified and free to teach can move to them without leaving its current teacher below the minimum.`,
      });
    }
  }
  return { moves, loadsAfter: new Map(load), after, flags };
}

/** Plain-language summary of what the optimizer changed and what is still unbalanced. */
export function explain(before: LoadRow[], after: { status: LoadStatus }[], moves: Move[]) {
  const count = (rows: { status: LoadStatus }[], s: LoadStatus) => rows.filter((r) => r.status === s).length;
  const b = { over: count(before, "OVERLOADED"), under: count(before, "UNDERLOADED") };
  const a = { over: count(after, "OVERLOADED"), under: count(after, "UNDERLOADED") };
  if (moves.length === 0) {
    return b.over + b.under === 0
      ? "Every faculty member is already within the load limits."
      : `No safe reassignment was found: ${b.over} overloaded and ${b.under} underloaded faculty remain because no compatible colleague is free, available, qualified for the level, and within the limits.`;
  }
  return [
    `${moves.length} reassignment(s) proposed.`,
    `Before: ${b.over} overloaded and ${b.under} underloaded. After: ${a.over} overloaded and ${a.under} underloaded.`,
    a.over + a.under > 0 ? "The rest have no compatible class to give or take without breaking a limit, an availability window, or causing a double booking." : "",
  ].filter(Boolean).join(" ");
}
