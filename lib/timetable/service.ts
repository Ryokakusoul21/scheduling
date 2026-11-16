import "server-only";
import { cache } from "react";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Scope } from "@/lib/permissions/scope";
import { z } from "zod";
import { DEFAULT_TIMETABLE, effectiveTimetable, timetableConfigSchema, timetableScopeKey, timetableTimeError, withinSchool, type TimetableBundle } from "./config";
import { submittedTimetableFilter } from "@/lib/scheduler/visibility";

export const timetableChoiceSchema = z.object({ departmentId: z.string().min(1).nullable(), termId: z.string().min(1).nullable() })
  .refine((s) => !s.departmentId || !!s.termId, "Choose an academic term for a department configuration.");
type Choice = z.infer<typeof timetableChoiceSchema>;
type Db = Prisma.TransactionClient;
class ConfigurationError extends Error {}
function bundleFrom(rows: { key: string; value: unknown }[]): TimetableBundle {
  const parsed = rows.map((r) => ({ key: r.key, config: timetableConfigSchema.safeParse(r.value) }));
  return { school: parsed.find((r) => r.key === "timetable:default" && r.config.success)?.config.data ?? DEFAULT_TIMETABLE,
    overrides: Object.fromEntries(parsed.filter((r) => r.key !== "timetable:default" && r.config.success).map((r) => [r.key, r.config.data!])),
  };
}
export async function readTimetableBundle(db: Db = prisma) {
  return bundleFrom(await db.systemSetting.findMany({ where: { key: { startsWith: "timetable:" } }, select: { key: true, value: true } }));
}
export const loadTimetableBundle = cache(() => readTimetableBundle());
export async function getTimetableConfig(termId: string, departmentId: string | null) {
  return effectiveTimetable(await loadTimetableBundle(), departmentId, termId);
}

async function guard(db: Db, scope: Scope, choice: Choice) {
  if (scope.status !== "ACTIVE" || scope.archivedAt || !["HEAD_OF_DEPARTMENT", "REGISTRAR", "SUPER_ADMINISTRATOR"].includes(scope.role)) throw new ConfigurationError("You cannot edit timetable configuration.");
  if (scope.role === "HEAD_OF_DEPARTMENT" && (!choice.departmentId || !scope.departmentIds.includes(choice.departmentId))) throw new ConfigurationError("Choose one of your assigned departments.");
  if (choice.departmentId && !await db.department.findUnique({ where: { id: choice.departmentId }, select: { id: true } })) throw new ConfigurationError("This department no longer exists.");
  if (choice.termId) {
    const term = await db.semester.findUnique({ where: { id: choice.termId }, select: { programId: true, program: { select: { departmentId: true } } } });
    if (!term || (choice.departmentId && term.program && term.program.departmentId !== choice.departmentId)) throw new ConfigurationError("Choose a term belonging to this department.");
    if (scope.role === "HEAD_OF_DEPARTMENT" && scope.programIds.length && (!term.programId || !scope.programIds.includes(term.programId))) throw new ConfigurationError("You may configure only terms for your assigned programs.");
  }
}

async function editorData(db: Db, scope: Scope, choice: Choice) {
  await guard(db, scope, choice);
  const rows = await db.systemSetting.findMany({ where: { key: { startsWith: "timetable:" } }, orderBy: { key: "asc" }, select: { key: true, value: true, updatedAt: true } });
  const bundle = bundleFrom(rows), key = timetableScopeKey(choice.departmentId, choice.termId);
  const parent = choice.departmentId ? effectiveTimetable({ ...bundle, overrides: Object.fromEntries(Object.entries(bundle.overrides).filter(([k]) => k !== key)) }, null, choice.termId) : bundle.school;
  return { rows, bundle, key, parent, own: rows.find((r) => r.key === key), config: effectiveTimetable(bundle, choice.departmentId, choice.termId) };
}

export async function loadTimetableEditor(scope: Scope, input: unknown) {
  const parsed = timetableChoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  try {
    const data = await editorData(prisma, scope, parsed.data);
    return { ok: true as const, config: timetableConfigSchema.safeParse(data.own?.value).data ?? data.config, parent: data.parent, inherited: !data.own, canInherit: !!parsed.data.termId };
  } catch (e) { return fail(e); }
}

const changeSchema = timetableChoiceSchema.safeExtend({ config: timetableConfigSchema, inherit: z.boolean() });
async function proposed(db: Db, scope: Scope, change: z.infer<typeof changeSchema>) {
  const data = await editorData(db, scope, change);
  if (change.inherit && !change.termId) throw new ConfigurationError("School defaults cannot inherit another configuration.");
  if (!change.inherit && change.termId && !withinSchool(change.config, data.parent)) throw new ConfigurationError("Department and term hours must stay within the school’s enabled days and operating hours.");
  const after: TimetableBundle = { school: data.bundle.school, overrides: { ...data.bundle.overrides } };
  if (!change.termId) after.school = change.config;
  else if (change.inherit) delete after.overrides[data.key];
  else after.overrides[data.key] = change.config;
  const where = { status: { not: "ARCHIVED" as const }, ...submittedTimetableFilter(scope.role), ...(change.termId ? { semesterId: change.termId } : {}),
    ...(change.departmentId ? { section: { departmentId: change.departmentId, ...(scope.role === "HEAD_OF_DEPARTMENT" && scope.programIds.length ? { programId: { in: scope.programIds } } : {}) } } : {}),
  };
  const [classes, exams] = await Promise.all([
    db.schedule.findMany({ where, orderBy: { id: "asc" }, select: { id: true, semesterId: true, dayOfWeek: true, startMin: true, endMin: true, updatedAt: true, section: { select: { name: true, departmentId: true } } } }),
    db.examination.findMany({ where, orderBy: { id: "asc" }, select: { id: true, semesterId: true, date: true, startMin: true, endMin: true, updatedAt: true, section: { select: { name: true, departmentId: true } } } }),
  ]);
  const entries = [...classes.map((r) => ({ ...r, kind: "Class" })), ...exams.map((r) => ({ ...r, kind: "Exam", dayOfWeek: (["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const)[r.date.getUTCDay()] }))];
  const issues = entries.flatMap((r) => {
    const reason = timetableTimeError(effectiveTimetable(after, r.section.departmentId, r.semesterId), r);
    return reason ? [{ id: r.id, kind: r.kind, section: r.section.name, reason, startMin: r.startMin, endMin: r.endMin }] : [];
  });
  const token = createHash("sha256").update(JSON.stringify({ change, versions: data.rows, entries })).digest("hex");
  return { ...data, token, issues, total: entries.length };
}

export async function previewTimetableChange(scope: Scope, input: unknown) {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  try { const p = await proposed(prisma, scope, parsed.data); return { ok: true as const, token: p.token, issues: p.issues.slice(0, 50), affected: p.issues.length, checked: p.total }; }
  catch (e) { return fail(e); }
}

export async function saveTimetableChange(scope: Scope, input: unknown) {
  const parsed = changeSchema.safeExtend({ token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Preview the changes before saving." };
  try {
    const { token, ...change } = parsed.data;
    await prisma.$transaction(async (tx) => {
      const p = await proposed(tx, scope, change);
      if (token !== p.token) throw new ConfigurationError("The configuration or timetable changed. Preview the changes again.");
      if (change.inherit) await tx.systemSetting.deleteMany({ where: { key: p.key } });
      else await tx.systemSetting.upsert({ where: { key: p.key }, create: { key: p.key, value: change.config }, update: { value: change.config } });
      await tx.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: change.departmentId, entity: "TimetableConfiguration", entityId: p.key,
        action: "Updated timetable configuration", oldValue: p.own?.value ?? {}, newValue: { inherit: change.inherit, config: change.config, affected: p.issues.length },
      } });
    }, { isolationLevel: "Serializable", timeout: 20000 });
    return { ok: true as const };
  } catch (e) { return fail(e); }
}
function fail(error: unknown) {
  if (error instanceof ConfigurationError) return { ok: false as const, error: error.message };
  console.error("Timetable configuration failed", error);
  return { ok: false as const, error: "Could not load or save the configuration. Please retry." };
}
