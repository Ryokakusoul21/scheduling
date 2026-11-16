import { z } from "zod";
import { ACADEMIC_LEVELS, GRADE_LEVELS, YEAR_LEVELS } from "@/lib/academics/levels";

export const DELIVERY_MODES = ["IN_PERSON", "ONLINE_LIVE"] as const;
export type ClassDeliveryMode = typeof DELIVERY_MODES[number];
export const DELIVERY_LABELS: Record<ClassDeliveryMode, string> = { IN_PERSON: "In person", ONLINE_LIVE: "Online — live" };
export const POLICY_KINDS = ["CLASS_DURATION", "DELIVERY_MODE"] as const;
export const isClassPolicy = (kind: string) => POLICY_KINDS.some((value) => value === kind);

const optionalId = z.string().trim().max(200).default("");
export const policyTargetSchema = z.object({
  termId: optionalId, level: z.enum(["", ...ACADEMIC_LEVELS]).default(""), programId: optionalId,
  yearLevel: z.enum(["", ...YEAR_LEVELS]).default(""), gradeLevel: z.enum(["", ...GRADE_LEVELS]).default(""),
  sectionIds: z.array(z.string().min(1).max(200)).max(200).default([]),
  sectionId: optionalId, subjectId: optionalId, classId: optionalId,
  subjectCategory: z.enum(["", "MAJOR", "MINOR"]).default(""),
  component: z.enum(["", "LECTURE", "LABORATORY"]).default(""),
});
export type PolicyTarget = z.infer<typeof policyTargetSchema>;
export const EMPTY_POLICY_TARGET: PolicyTarget = policyTargetSchema.parse({});
export const durationPolicySchema = z.object({
  target: policyTargetSchema.default(EMPTY_POLICY_TARGET),
  allowedMinutes: z.array(z.number().int().min(5).max(720)).min(1, "Choose at least one meeting length.").max(12)
    .transform((values) => [...new Set(values)].sort((a, b) => a - b)),
  allowFinalRemainder: z.boolean().default(true),
});
export const deliveryPolicySchema = z.object({
  target: policyTargetSchema.default(EMPTY_POLICY_TARGET),
  allowedModes: z.array(z.enum(DELIVERY_MODES)).min(1, "Choose at least one delivery mode.").max(2),
  defaultMode: z.enum(DELIVERY_MODES),
}).refine((p) => p.allowedModes.includes(p.defaultMode), { message: "The default delivery mode must be allowed.", path: ["defaultMode"] });

export interface PolicyClass {
  id?: string; semesterId?: string; sectionId: string; subjectId: string;
  component: string; deliveryMode?: string;
}
export interface PolicySection { departmentId?: string | null; level?: string; programId?: string | null; yearLevel?: string | null; gradeLevel?: string | null }
export interface PolicySubject { category?: string; lectureHours?: number; labHours?: number }
export interface PolicyRule { id: string; kind: string; params: unknown; departmentId: string | null }

/** All specified filters intersect: e.g. a program, first year, and minor subjects. */
export function policyMatches(rule: PolicyRule, entry: PolicyClass, section: PolicySection = {}, subject: PolicySubject = {}) {
  if (rule.departmentId && rule.departmentId !== section.departmentId) return false;
  const parsed = policyTargetSchema.safeParse((rule.params as { target?: unknown } | null)?.target ?? {});
  if (!parsed.success) return false;
  const t = parsed.data;
  return (!t.termId || t.termId === entry.semesterId)
    && (!t.level || t.level === section.level) && (!t.programId || t.programId === section.programId)
    && (!t.yearLevel || t.yearLevel === section.yearLevel) && (!t.gradeLevel || t.gradeLevel === section.gradeLevel)
    && (!t.sectionIds.length || t.sectionIds.includes(entry.sectionId)) && (!t.sectionId || t.sectionId === entry.sectionId) && (!t.subjectId || t.subjectId === entry.subjectId)
    && (!t.classId || t.classId === entry.id) && (!t.subjectCategory || t.subjectCategory === subject.category)
    && (!t.component || t.component === entry.component);
}

export function matchingPolicies(kind: string, rules: PolicyRule[], entry: PolicyClass, section?: PolicySection, subject?: PolicySubject) {
  return rules.filter((r) => r.kind === kind && policyMatches(r, entry, section, subject));
}

function specificity(rule: PolicyRule) {
  const target = policyTargetSchema.parse((rule.params as { target?: unknown }).target ?? {});
  return (rule.departmentId ? 2 : 0) + Object.entries(target).reduce((sum, [key, value]) => sum + ((Array.isArray(value) ? value.length > 0 : !!value) ? ({ sectionIds: 200, classId: 1000, sectionId: 200, subjectId: 100, yearLevel: 40, gradeLevel: 40, programId: 20 }[key] ?? 5) : 0), 0);
}

/** Narrower rules choose the default, but every matching restriction remains required. */
export function deliveryPolicy(rules: PolicyRule[], entry: PolicyClass, section?: PolicySection, subject?: PolicySubject) {
  const matching = matchingPolicies("DELIVERY_MODE", rules, entry, section, subject)
    .map((rule) => ({ rule, parsed: deliveryPolicySchema.safeParse(rule.params) })).filter((r) => r.parsed.success)
    .sort((a, b) => specificity(b.rule) - specificity(a.rule) || a.rule.id.localeCompare(b.rule.id));
  const allowed = DELIVERY_MODES.filter((mode) => matching.every((r) => r.parsed.data!.allowedModes.includes(mode)));
  const preferred = matching.map((r) => r.parsed.data!.defaultMode).find((mode) => allowed.includes(mode));
  return { allowed, defaultMode: preferred ?? allowed[0] ?? "IN_PERSON", conflicting: allowed.length === 0 };
}

export function durationPolicy(rules: PolicyRule[], entry: PolicyClass, section?: PolicySection, subject?: PolicySubject) {
  const parsed = matchingPolicies("CLASS_DURATION", rules, entry, section, subject).map((r) => durationPolicySchema.safeParse(r.params)).filter((p) => p.success);
  if (!parsed.length) return null;
  const allowedMinutes = parsed[0].data!.allowedMinutes.filter((minutes) => parsed.every((p) => p.data!.allowedMinutes.includes(minutes)));
  return { allowedMinutes, allowFinalRemainder: parsed.every((p) => p.data!.allowFinalRemainder) };
}

/** Prefer an exact combination before using an approved shorter final remainder. */
export function splitPolicyMinutes(total: number, allowed: number[], remainder: boolean): number[] | null {
  const lengths = [...allowed].filter((n) => n > 0).sort((a, b) => b - a);
  if (!lengths.length || total <= 0) return null;
  const memo = new Map<number, number[] | null>();
  const exact = (left: number): number[] | null => {
    if (left === 0) return [];
    if (memo.has(left)) return memo.get(left)!;
    for (const n of lengths) if (n <= left) {
      const tail = exact(left - n);
      if (tail) { const result = [n, ...tail]; memo.set(left, result); return result; }
    }
    memo.set(left, null); return null;
  };
  const result = exact(total);
  if (result || !remainder) return result;
  for (let last = 1; last < Math.min(...lengths) && last <= total; last++) {
    const head = exact(total - last);
    if (head) return [...head, last];
  }
  return null;
}

/** Meeting length in hours, for example 60 -> "1 hour", 90 -> "1.5 hours". */
export function hoursLabel(minutes: number) {
  const h = Math.round((minutes / 60) * 100) / 100;
  return `${h} hour${h === 1 ? "" : "s"}`;
}
