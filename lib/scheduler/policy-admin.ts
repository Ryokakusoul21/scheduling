import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { departmentWhere } from "@/lib/permissions/department";
import { checkEntry, type ConstraintRule, type ConstraintContext } from "./constraints";
import { policyMatches, policyTargetSchema } from "./class-policies";
import { toSchedEntry } from "./mappers";
import { loadPolicyOptions } from "./policy-options-server";
import { scopedPolicyOptions } from "./policy-options";

/** References in a rule must remain visible to its author and belong to its department. */
export async function validatePolicyTarget(scope: Scope, rule: ConstraintRule) {
  const t = policyTargetSchema.parse((rule.params as { target?: unknown }).target ?? {});
  const options = await loadPolicyOptions(scope);
  if (rule.departmentId && !options.departments?.some((d) => d.value === rule.departmentId)) throw new Error("Choose a department you are authorized to manage.");
  if (!rule.departmentId && !scope.isAdmin) throw new Error("School-wide rules can only be managed by the Registrar or Administrator.");
  const scoped = scopedPolicyOptions(options, rule.departmentId ?? "", t);
  const checks = [
    !t.level || scoped.levels.includes(t.level),
    !t.termId || scoped.terms.some((term) => term.value === t.termId),
    !t.programId || scoped.programs.some((program) => program.value === t.programId),
    !t.yearLevel || scoped.levels.includes("COLLEGE"),
    !t.gradeLevel || scoped.grades.includes(t.gradeLevel),
    !t.sectionId || scoped.sections.some((section) => section.value === t.sectionId),
    t.sectionIds.every((id) => scoped.sections.some((section) => section.value === id)),
    !t.subjectId || scoped.subjects.some((subject) => subject.value === t.subjectId),
    !t.classId || scoped.classes.some((meeting) => meeting.value === t.classId),
  ];
  if (checks.some((valid) => !valid)) throw new Error("A selected target is outside this department, period, or program assignment. Refresh and choose again.");
  if (t.yearLevel && t.level && t.level !== "COLLEGE") throw new Error("College year levels require the College academic level.");
  if (t.gradeLevel && t.level === "COLLEGE") throw new Error("Choose a basic-education level for a grade target.");
}

/** Preview only: changing a policy never rewrites or retimes existing classes. */
export async function previewClassPolicy(scope: Scope, rule: ConstraintRule) {
  await validatePolicyTarget(scope, rule);
  const t = policyTargetSchema.parse((rule.params as { target?: unknown }).target ?? {});
  const rows = await prisma.schedule.findMany({
    where: { status: { not: "ARCHIVED" }, ...(t.termId ? { semesterId: t.termId } : {}), AND: [departmentWhere.schedule(scope), ...(rule.departmentId ? [{ section: { departmentId: rule.departmentId } }] : [])] },
    include: { section: true, subject: true }, orderBy: { id: "asc" },
  });
  const entries = rows.map(toSchedEntry);
  const ctx: ConstraintContext = {
    rooms: new Map(), faculty: new Map(), programNames: new Map(),
    sections: new Map(rows.map((r) => [r.sectionId, { ...r.section, programId: r.section.programId, departmentId: r.section.departmentId }])),
    subjects: new Map(rows.map((r) => [r.subjectId, r.subject])),
  };
  const matched = rows.filter((r) => policyMatches(rule, r, r.section, r.subject));
  const affected = matched.filter((r) => checkEntry(toSchedEntry(r), entries.filter((e) => e.id !== r.id), [rule], ctx).length > 0);
  const token = createHash("sha256").update(JSON.stringify({ id: rule.id, kind: rule.kind, params: rule.params, departmentId: rule.departmentId, rows: rows.map((r) => [r.id, r.updatedAt, r.section.updatedAt, r.subject.updatedAt]) })).digest("hex");
  return { token, matching: matched.length, affected: affected.length, published: affected.filter((r) => r.status === "PUBLISHED").length };
}
