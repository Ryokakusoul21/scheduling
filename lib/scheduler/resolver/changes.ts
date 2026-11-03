/** Applying, reverting, and re-checking a set of proposed changes. Pure; used by the review UI, the server, and tests. */
import { validatePlacement, type Finding, type ValidationWorld } from "../validate";
import { countIssues, live, worldOf } from "./issues";
import type { Change, ResolverEntry, ResolverInput } from "./types";

/** The timetable after the changes; removed classes stay in the list as archived so they can be restored. */
export function applyChanges(entries: ResolverEntry[], changes: Change[]): ResolverEntry[] {
  const map = new Map(entries.map((e) => [e.id, e]));
  for (const c of changes) {
    if (c.after) map.set(c.after.id, c.after);
    else if (c.before) map.set(c.before.id, { ...c.before, status: "ARCHIVED" });
  }
  return [...map.values()];
}

/** The timetable with the changes taken back, newest first. */
export function revertChanges(entries: ResolverEntry[], changes: Change[]): ResolverEntry[] {
  const map = new Map(entries.map((e) => [e.id, e]));
  for (const c of [...changes].reverse()) {
    if (c.before) map.set(c.before.id, c.before);
    else if (c.after) map.delete(c.after.id);
  }
  return [...map.values()];
}

const key = (f: Finding) => `${f.source}|${[...f.entryIds].sort().join("+")}`;

/** Hard findings of a change's result that its original did not already have. */
export function introducedHard(change: Change, before: ResolverEntry[], after: ResolverEntry[], world: ValidationWorld): Finding[] {
  if (!change.after) return [];
  const had = new Set(change.before ? validatePlacement(change.before, live(before), world).filter((f) => f.hard).map(key) : []);
  return validatePlacement(change.after, live(after), world).filter((f) => f.hard && !had.has(key(f)));
}

/**
 * Keeps only the accepted changes that still hold together: a group (a class plus any class moved to make
 * room for it) is all or nothing, and a change that would now add a hard problem is dropped with its group.
 */
export function checkSelection(input: ResolverInput, base: ResolverEntry[], changes: Change[], acceptedIds: Iterable<string>, sectionIds: Set<string>) {
  const world = worldOf(input);
  const accepted = new Set(acceptedIds);
  const groups = new Map<string, Change[]>();
  for (const c of changes) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const dropGroup = (group: string) => groups.get(group)?.forEach((c) => accepted.delete(c.id));
  for (const [group, list] of groups) if (list.some((c) => !accepted.has(c.id))) dropGroup(group);

  for (;;) {
    const chosen = changes.filter((c) => accepted.has(c.id));
    const state = applyChanges(base, chosen);
    const bad = chosen.filter((c) => introducedHard(c, base, state, world).length > 0);
    if (!bad.length) {
      return { accepted: chosen.map((c) => c.id), dropped: changes.filter((c) => !accepted.has(c.id)).map((c) => c.id), counts: countIssues(input, state, sectionIds, world) };
    }
    bad.forEach((c) => dropGroup(c.group));
  }
}
