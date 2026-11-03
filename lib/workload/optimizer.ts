/**
 * Faculty Workload Optimization, the single source of the balance rules. Teaching load is balanced by moving
 * whole assignments (every meeting of one subject for one section, or an assigned subject not yet scheduled)
 * from overloaded faculty to colleagues with room, then topping up the underloaded, then evening out each
 * department within the tolerance. Receivers must teach the level, be available and free at every meeting
 * time, stay within their limits, and belong to the same department (or, when allowed, match the subject by
 * specialization). Candidates are ranked by department, specialization, fewest moves, smallest class that does
 * the job, and the lowest resulting imbalance. Pure and deterministic (tests/workload.test.ts).
 */
import { rangesOverlap, type DayOfWeek } from "@/lib/scheduler/types";

export interface WorkloadLimits {
  measure: "HOURS" | "UNITS";
  minimum: number;
  maximum: number;
  partTimeMinimum?: number;
  partTimeMaximum?: number;
  /** Cap on subject units when loads are measured in hours. */
  maxUnits?: number;
  /** How far a load may sit from its department's average before it is evened out; 0 or missing turns it off. */
  tolerance?: number;
  crossDepartment?: "BOTH_HEADS" | "DISALLOWED";
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
  /** Assigned but not yet scheduled: weekly hours from the curriculum, moved by changing the assignment. */
  plannedHours?: number;
  assignmentId?: string;
}

export interface WFaculty {
  id: string;
  name: string;
  departmentId: string | null;
  specialization: string | null;
  teachingLevels: string[];
  /** Personal cap in weekly hours; the effective maximum is the lower of this and the range for their employment type. */
  maxHours: number;
  employmentType?: "FULL_TIME" | "PART_TIME";
  availability: { dayOfWeek: DayOfWeek; startMin: number; endMin: number }[];
}

export interface Move {
  key: string;
  scheduleIds: string[];
  /** Set when the move hands over an unscheduled subject assignment. */
  assignmentId?: string;
  label: string;
  fromFacultyId: string;
  toFacultyId: string;
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  amount: number;
  units: number;
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
  /** Assignment keys (never moved) or "key>receiverId" pairs (never offered to that receiver) a person declined. */
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
  units: number;
  minimum: number;
  maximum: number;
  status: LoadStatus;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const hoursOf = (a: Assignment) => (a.meetings.length ? a.meetings.reduce((s, m) => s + (m.endMin - m.startMin), 0) / 60 : (a.plannedHours ?? 0));

export function amountOf(a: Assignment, limits: WorkloadLimits) {
  return limits.measure === "HOURS" ? round1(hoursOf(a)) : a.subjectUnits;
}

export function minimumFor(f: Pick<WFaculty, "employmentType">, limits: WorkloadLimits) {
  return f.employmentType === "PART_TIME" ? (limits.partTimeMinimum ?? limits.minimum) : limits.minimum;
}

export function maximumFor(f: Pick<WFaculty, "employmentType" | "maxHours">, limits: WorkloadLimits) {
  const range = f.employmentType === "PART_TIME" ? (limits.partTimeMaximum ?? limits.maximum) : limits.maximum;
  return limits.measure === "HOURS" ? Math.min(range, f.maxHours) : range;
}

/** Over the maximum (or the unit cap) is overloaded, under the minimum is underloaded, anything else balanced. */
export function statusOf(load: number, minimum: number, maximum: number, units = 0, maxUnits?: number): LoadStatus {
  return load > maximum || (!!maxUnits && units > maxUnits) ? "OVERLOADED" : load < minimum ? "UNDERLOADED" : "BALANCED";
}

/** Balanced but at 90 percent of the maximum or more. */
export function nearLimit(r: Pick<LoadRow, "status" | "load" | "maximum">) {
  return r.status === "BALANCED" && r.load >= r.maximum * 0.9;
}

const unitCap = (limits: WorkloadLimits) => (limits.measure === "HOURS" ? limits.maxUnits : undefined);

/** Current load of every faculty member against their minimum and maximum. */
export function loadReport(faculty: WFaculty[], assignments: Assignment[], limits: WorkloadLimits): LoadRow[] {
  return faculty.map((f) => {
    const own = assignments.filter((a) => a.facultyId === f.id);
    const load = round1(own.reduce((s, a) => s + amountOf(a, limits), 0));
    const units = round1(own.reduce((s, a) => s + a.subjectUnits, 0));
    const minimum = minimumFor(f, limits);
    const maximum = maximumFor(f, limits);
    return { facultyId: f.id, name: f.name, load, units, minimum, maximum, status: statusOf(load, minimum, maximum, units, unitCap(limits)) };
  });
}

/**
 * Counts per status and a 0 to 100 balance score: the share of faculty who are within their range and,
 * when a tolerance is set, within that distance of their department's average load.
 */
export function balanceSummary(rows: (Pick<LoadRow, "load" | "status" | "maximum"> & { departmentId: string | null })[], tolerance = 0) {
  const avg = new Map<string, number>();
  for (const d of new Set(rows.map((r) => r.departmentId ?? ""))) {
    const own = rows.filter((r) => (r.departmentId ?? "") === d);
    avg.set(d, own.reduce((s, r) => s + r.load, 0) / own.length);
  }
  const even = rows.filter((r) => r.status === "BALANCED" && (!tolerance || Math.abs(r.load - avg.get(r.departmentId ?? "")!) <= tolerance)).length;
  return {
    overloaded: rows.filter((r) => r.status === "OVERLOADED").length,
    underloaded: rows.filter((r) => r.status === "UNDERLOADED").length,
    balanced: rows.filter((r) => r.status === "BALANCED").length,
    nearLimit: rows.filter(nearLimit).length,
    score: rows.length ? Math.round((even / rows.length) * 100) : 100,
  };
}

function specializationMatch(f: WFaculty, a: Assignment) {
  const words = (f.specialization ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && w !== "and");
  const subject = a.subjectName.toLowerCase();
  return words.some((w) => subject.includes(w));
}

/** Teaches the level and is available and free at every meeting (unscheduled subjects only need the level). */
export function isFree(f: WFaculty, a: Assignment, busy: WMeeting[]) {
  return a.sectionLevel !== "" && f.teachingLevels.includes(a.sectionLevel) &&
    a.meetings.every((m) =>
      (f.availability.length === 0 || f.availability.some((w) => w.dayOfWeek === m.dayOfWeek && m.startMin >= w.startMin && m.endMin <= w.endMin)) &&
      !busy.some((b) => b.scheduleId !== m.scheduleId && b.dayOfWeek === m.dayOfWeek && rangesOverlap(b, m))
    );
}

/** Same department, or (unless cross-department moves are disallowed) a specialization that matches the subject. */
export function qualifies(r: WFaculty, a: Assignment, homeDepartmentId: string | null | undefined, limits: WorkloadLimits) {
  const sameDepartment = !!r.departmentId && r.departmentId === homeDepartmentId;
  return sameDepartment || (limits.crossDepartment !== "DISALLOWED" && specializationMatch(r, a));
}

/**
 * Proposes moves until nobody is overloaded, underloaded faculty are topped up where a compatible class
 * exists, and each department sits within the tolerance of its average. `busy` holds every meeting each
 * faculty member already teaches (all departments), so receivers are never double-booked. Anything that
 * cannot be fixed without breaking a rule is returned as a flag with an explanation.
 */
export function optimize(faculty: WFaculty[], assignments: Assignment[], limits: WorkloadLimits, busy: Map<string, WMeeting[]>, opts: OptimizeOptions = {}) {
  const byId = new Map(faculty.map((f) => [f.id, f]));
  const unassigned = opts.unassigned ?? [];
  assignments = [...assignments, ...unassigned];
  const owner = new Map(assignments.map((a) => [a.key, a.facultyId]));
  const nameOf = (id: string) => byId.get(id)?.name ?? opts.inactiveNames?.get(id) ?? "An inactive faculty member";
  const unit = limits.measure === "HOURS" ? "hours" : "units";
  const measureWord = limits.measure === "HOURS" ? "hour" : "unit";
  const flags: Flag[] = [];
  const report = loadReport(faculty, assignments, limits);
  const load = new Map(report.map((r) => [r.facultyId, r.load]));
  const units = new Map(report.map((r) => [r.facultyId, r.units]));
  const schedule = new Map([...busy.entries()].map(([k, v]) => [k, [...v]]));
  const max = (id: string) => maximumFor(byId.get(id)!, limits);
  const min = (id: string) => minimumFor(byId.get(id)!, limits);
  const cap = unitCap(limits);
  const over = (id: string) => (load.get(id) ?? 0) > max(id) || (!!cap && (units.get(id) ?? 0) > cap);
  const moves: Move[] = [];
  const moved = new Set<string>();
  const declined = (a: Assignment, r: WFaculty) => !!opts.blocked?.has(a.key) || !!opts.blocked?.has(`${a.key}>${r.id}`);
  const fits = (r: WFaculty, a: Assignment) => (load.get(r.id) ?? 0) + amountOf(a, limits) <= max(r.id) && (!cap || (units.get(r.id) ?? 0) + a.subjectUnits <= cap);
  const homeOf = (a: Assignment, donorId: string) => a.departmentId ?? byId.get(donorId)?.departmentId;

  /** Best class to move from the donor: the fewest moves first, then the smallest class that does the job, then the best receiver. */
  function bestMove(donorId: string, receivers: WFaculty[], keepDonorAtLeast: number, need: number) {
    let best: { a: Assignment; r: WFaculty; score: number } | null = null;
    for (const a of assignments) {
      if (owner.get(a.key) !== donorId || moved.has(a.key)) continue;
      const amount = amountOf(a, limits);
      if ((load.get(donorId) ?? 0) - amount < keepDonorAtLeast) continue;
      const home = homeOf(a, donorId);
      for (const r of receivers) {
        if (r.id === donorId || declined(a, r) || !fits(r, a) || !isFree(r, a, schedule.get(r.id) ?? []) || !qualifies(r, a, home, limits)) continue;
        const after = (load.get(r.id) ?? 0) + amount;
        const resolves = amount >= need;
        const score =
          (r.departmentId && r.departmentId === home ? 1000 : 0) +
          (specializationMatch(r, a) ? 100 : 0) +
          (resolves ? 50 - amount : amount) +
          ((load.get(r.id) ?? 0) < min(r.id) ? 20 : 0) -
          Math.abs(after - (min(r.id) + max(r.id)) / 2) / 10;
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
    units.set(donorId, round1((units.get(donorId) ?? 0) - a.subjectUnits));
    units.set(r.id, round1((units.get(r.id) ?? 0) + a.subjectUnits));
    owner.set(a.key, r.id);
    moved.add(a.key);
    schedule.set(r.id, [...(schedule.get(r.id) ?? []), ...a.meetings]);
    schedule.set(donorId, (schedule.get(donorId) ?? []).filter((m) => !a.meetings.some((x) => x.scheduleId === m.scheduleId)));
    moves.push(describeMove(a, donorId, donor.name, donor.departmentId ?? null, r, before.d, before.r, limits, why));
  }

  const sortedReceivers = () => [...faculty].sort((x, y) => (load.get(x.id) ?? 0) - (load.get(y.id) ?? 0));

  // Phase 0: classes of inactive or on-leave faculty must go to a qualified, free colleague.
  for (const donorId of new Set(unassigned.map((a) => a.facultyId))) {
    for (let guard = 0; guard < 100; guard++) {
      const m = bestMove(donorId, sortedReceivers(), -Infinity, 0);
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

  // Phase 1: bring every overloaded faculty member down to their maximum (and the unit cap).
  const stuck = new Set<string>();
  for (let guard = 0; guard < 200; guard++) {
    const donor = faculty
      .filter((f) => !stuck.has(f.id) && over(f.id))
      .sort((x, y) => (load.get(y.id) ?? 0) - max(y.id) - ((load.get(x.id) ?? 0) - max(x.id)))[0];
    if (!donor) break;
    const m = bestMove(donor.id, sortedReceivers(), 0, (load.get(donor.id) ?? 0) - max(donor.id));
    if (!m) stuck.add(donor.id);
    else apply(donor.id, m.a, m.r, `${donor.name} is over the ${max(donor.id)}-${measureWord} maximum${cap && (units.get(donor.id) ?? 0) > cap ? ` or the ${cap}-unit cap` : ""}.`);
  }

  // Phase 2: top up underloaded faculty from colleagues who stay at or above their own minimum.
  for (let guard = 0; guard < 200; guard++) {
    let done = false;
    for (const r of sortedReceivers().filter((f) => (load.get(f.id) ?? 0) < min(f.id))) {
      const donors = faculty.filter((f) => f.id !== r.id && (load.get(f.id) ?? 0) > min(f.id)).sort((x, y) => (load.get(y.id) ?? 0) - (load.get(x.id) ?? 0));
      const found = donors.map((d) => ({ d, m: bestMove(d.id, [r], min(d.id), min(r.id) - (load.get(r.id) ?? 0)) })).find((x) => x.m);
      if (found) {
        apply(found.d.id, found.m!.a, r, `${r.name} is under the ${min(r.id)}-${measureWord} minimum.`);
        done = true;
        break;
      }
    }
    if (!done) break;
  }

  // Phase 3: even out each department so nobody sits further than the tolerance from its average.
  const tolerance = limits.tolerance ?? 0;
  for (const dept of tolerance > 0 ? new Set(faculty.map((f) => f.departmentId).filter(Boolean)) : []) {
    const team = faculty.filter((f) => f.departmentId === dept);
    for (let guard = 0; guard < 100 && team.length > 1; guard++) {
      const avg = team.reduce((s, f) => s + (load.get(f.id) ?? 0), 0) / team.length;
      const high = team.filter((f) => (load.get(f.id) ?? 0) > avg + tolerance).sort((x, y) => (load.get(y.id) ?? 0) - (load.get(x.id) ?? 0))[0];
      const low = team.filter((f) => (load.get(f.id) ?? 0) < avg - tolerance).sort((x, y) => (load.get(x.id) ?? 0) - (load.get(y.id) ?? 0))[0];
      if (!high || !low) break;
      const gap = (load.get(high.id) ?? 0) - (load.get(low.id) ?? 0);
      // Only a class smaller than the gap narrows it; the one closest to half the gap evens them best.
      const pick = assignments
        .filter((a) => owner.get(a.key) === high.id && !moved.has(a.key) && !declined(a, low) && amountOf(a, limits) < gap &&
          (load.get(high.id) ?? 0) - amountOf(a, limits) >= min(high.id) && fits(low, a) && isFree(low, a, schedule.get(low.id) ?? []))
        .sort((x, y) => Math.abs(amountOf(x, limits) - gap / 2) - Math.abs(amountOf(y, limits) - gap / 2))[0];
      if (!pick) break;
      apply(high.id, pick, low, `Evens out the department: ${high.name} is more than ${tolerance} ${unit} above its average of ${round1(avg)} and ${low.name} more than ${tolerance} below.`);
    }
  }

  const after = faculty.map((f) => ({ id: f.id, status: statusOf(load.get(f.id) ?? 0, min(f.id), max(f.id), units.get(f.id) ?? 0, cap) }));
  for (const f of faculty) {
    const l = load.get(f.id) ?? 0;
    if (over(f.id)) {
      flags.push({
        kind: "OVERLOADED", facultyId: f.id, label: f.name,
        explanation: `${f.name} stays at ${l} ${unit}${cap ? ` and ${units.get(f.id)} units` : ""} (maximum ${max(f.id)}${cap ? `, cap ${cap} units` : ""}): no compatible faculty member is available and free at the class times without exceeding their own maximum${assignments.some((a) => owner.get(a.key) === f.id && opts.blocked?.has(a.key)) ? ", or the remaining classes were kept in place when a fix was undone or a proposal rejected" : ""}.`,
      });
    } else if (l < min(f.id)) {
      flags.push({
        kind: "UNDERLOADED", facultyId: f.id, label: f.name,
        explanation: `${f.name} stays at ${l} ${unit} (minimum ${min(f.id)}): no class they are qualified and free to teach can move to them without leaving its current teacher below the minimum.`,
      });
    }
  }
  return { moves, loadsAfter: new Map(load), after, flags };
}

function describeMove(a: Assignment, donorId: string, donorName: string, donorDepartmentId: string | null, r: WFaculty, donorBefore: number, receiverBefore: number, limits: WorkloadLimits, why: string): Move {
  const amount = amountOf(a, limits);
  const unit = limits.measure === "HOURS" ? "hours" : "units";
  const home = a.departmentId ?? donorDepartmentId;
  const traits = [
    r.departmentId && r.departmentId === home ? "same department" : "another department",
    specializationMatch(r, a) ? `specialization in ${r.specialization}` : null,
    a.meetings.length ? "available and free at every meeting time" : "subject not scheduled yet",
  ].filter(Boolean).join(", ");
  return {
    key: a.key,
    scheduleIds: a.meetings.map((m) => m.scheduleId),
    assignmentId: a.assignmentId,
    label: `${a.subjectName}, ${a.sectionName}`,
    fromFacultyId: donorId,
    toFacultyId: r.id,
    fromDepartmentId: donorDepartmentId,
    toDepartmentId: r.departmentId,
    amount,
    units: a.subjectUnits,
    fromBefore: donorBefore,
    fromAfter: round1(donorBefore - amount),
    toBefore: receiverBefore,
    toAfter: round1(receiverBefore + amount),
    reason: `${why} Moves ${amount} ${unit} from ${donorName} (${donorBefore} to ${round1(donorBefore - amount)} ${unit}) to ${r.name} (${receiverBefore} to ${round1(receiverBefore + amount)} ${unit}): ${traits}.`,
  };
}

/**
 * Re-checks reviewed rows against the live timetable, applied in order: each class must still belong to the
 * original faculty member, and each receiver must still be qualified, free, and within limits after the
 * earlier rows. Returns the moves with current before and after loads, or every problem found.
 */
export function validateRows(
  data: { faculty: WFaculty[]; assignments: Assignment[]; busy: Map<string, WMeeting[]>; limits: WorkloadLimits },
  rows: { key: string; fromFacultyId: string; toFacultyId: string; reason?: string }[],
): { ok: true; moves: Move[] } | { ok: false; problems: string[] } {
  const { faculty, assignments, limits } = data;
  const byId = new Map(faculty.map((f) => [f.id, f]));
  const loads = new Map(loadReport(faculty, assignments, limits).map((r) => [r.facultyId, { load: r.load, units: r.units }]));
  const schedule = new Map([...data.busy.entries()].map(([k, v]) => [k, [...v]]));
  const cap = unitCap(limits);
  const problems: string[] = [];
  const moves: Move[] = [];
  for (const row of rows) {
    const a = assignments.find((x) => x.key === row.key);
    const r = byId.get(row.toFacultyId);
    const donor = byId.get(row.fromFacultyId);
    if (!a || a.facultyId !== row.fromFacultyId) { problems.push(`${a ? `${a.subjectName}, ${a.sectionName}` : "A class"} changed since it was proposed.`); continue; }
    const label = `${a.subjectName}, ${a.sectionName}`;
    if (!r) { problems.push(`${label}: the receiving faculty member is no longer active.`); continue; }
    const amount = amountOf(a, limits);
    const now = loads.get(r.id) ?? { load: 0, units: 0 };
    if (now.load + amount > maximumFor(r, limits) || (cap && now.units + a.subjectUnits > cap)) { problems.push(`${label}: ${r.name} would go over their maximum.`); continue; }
    if (!isFree(r, a, schedule.get(r.id) ?? [])) { problems.push(`${label}: ${r.name} does not teach this level or is not free at every meeting time.`); continue; }
    if (!qualifies(r, a, a.departmentId ?? donor?.departmentId, limits)) { problems.push(`${label}: ${r.name} is in another department and their specialization does not match${limits.crossDepartment === "DISALLOWED" ? ", and cross-department moves are turned off" : ""}.`); continue; }
    const from = loads.get(row.fromFacultyId) ?? { load: 0, units: 0 };
    moves.push(describeMove(a, row.fromFacultyId, donor?.name ?? "An inactive faculty member", donor?.departmentId ?? null, r, from.load, now.load, limits, row.reason ?? "Reviewed by the Head of Department."));
    loads.set(row.fromFacultyId, { load: round1(from.load - amount), units: round1(from.units - a.subjectUnits) });
    loads.set(r.id, { load: round1(now.load + amount), units: round1(now.units + a.subjectUnits) });
    schedule.set(r.id, [...(schedule.get(r.id) ?? []), ...a.meetings]);
  }
  return problems.length ? { ok: false, problems } : { ok: true, moves };
}

/** Fingerprint of who teaches what among the given faculty; any reassignment or class change alters it. */
export function basisOf(assignments: Assignment[], facultyIds: Iterable<string>, limits: WorkloadLimits) {
  const ids = new Set(facultyIds);
  const text = assignments.filter((a) => ids.has(a.facultyId)).map((a) => `${a.key}@${a.facultyId}=${amountOf(a, limits)}`).sort().join(";");
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${ids.size}:${(h >>> 0).toString(36)}`;
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
