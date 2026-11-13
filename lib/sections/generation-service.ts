import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { YEAR_LEVELS } from "@/lib/academics/levels";
import { can } from "@/lib/permissions/policy";
import { policyUserFromScope, type Scope } from "@/lib/permissions/scope";
import { planSectionGeneration, type SectionGenerationContext } from "./generation";

const keysSchema = z.object({ programId: z.string().min(1), yearLevel: z.enum(YEAR_LEVELS), semesterId: z.string().min(1) });
const inputSchema = keysSchema.extend({
  totalLearners: z.number().int().min(1).max(10000), maximum: z.number().int().min(1).max(500),
  balanced: z.boolean(), mode: z.enum(["ADD", "REBALANCE"]), pattern: z.enum(["NAME", "CODE"]),
  linkCurriculum: z.boolean(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
const countsSelect = { schedules: true, students: true, examinations: true, subjectAssignments: true } as const;
const sectionSelect = { id: true, name: true, studentCount: true, departmentId: true, programId: true, updatedAt: true, archivedAt: true,
  sortOrder: true, generationBatchId: true, _count: { select: countsSelect } } as const;
type Db = Prisma.TransactionClient;
class GenerationError extends Error {}
const STALE = "Sections or curriculum changed after this preview. Refresh the preview before generating.";

function allowed(scope: Scope, departmentId: string | null, programId: string) {
  return can(policyUserFromScope(scope), "autoGenerate", { type: "section", departmentId, programId });
}

async function load(db: Db, scope: Scope, keys: z.infer<typeof keysSchema>) {
  const [program, term] = await Promise.all([
    db.program.findUnique({ where: { id: keys.programId }, select: { id: true, code: true, name: true, departmentId: true, level: true } }),
    db.semester.findUnique({ where: { id: keys.semesterId }, select: { id: true, type: true, level: true, programId: true } }),
  ]);
  if (!program || program.level !== "COLLEGE" || !term || term.level !== "COLLEGE" || (term.programId && term.programId !== program.id)) throw new GenerationError("Choose a valid college program and academic term.");
  if (!allowed(scope, program.departmentId, program.id)) throw new GenerationError("You can only generate sections for your assigned departments and programs.");
  const [sections, subjects] = await Promise.all([
    db.section.findMany({ where: { programId: program.id, yearLevel: keys.yearLevel, semesterId: term.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }], select: sectionSelect }),
    db.subject.findMany({ where: { archivedAt: null, yearLevel: keys.yearLevel,
      OR: [{ programId: program.id }, { sharedPrograms: { some: { id: program.id } } }],
      AND: [{ OR: [{ semester: term.type }, { semester: null }] }],
    }, select: { id: true, lectureHours: true, labHours: true }, orderBy: { id: "asc" } }),
  ]);
  if (sections.some((s) => !allowed(scope, s.departmentId, program.id))) throw new GenerationError("Some sections belong to another department. Ask the Registrar to review ownership.");
  const active = sections.filter((s) => !s.archivedAt);
  const context: SectionGenerationContext = {
    existing: active.map((s) => ({ id: s.id, name: s.name, studentCount: s.studentCount, enrolledStudents: s._count.students })),
    reservedNames: sections.map((s) => s.name),
    fingerprint: createHash("sha256").update(JSON.stringify({ program, term, sections, subjects })).digest("hex"),
    curriculumClasses: subjects.reduce((sum, s) => sum + Number(s.lectureHours > 0) + Number(s.labHours > 0), 0),
  };
  return { context, program, term, sections: active, subjects, allSections: sections };
}

export async function sectionGenerationContext(scope: Scope, input: unknown) {
  const parsed = keysSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Choose a program, year level, and term." };
  try { return { ok: true as const, context: (await load(prisma, scope, parsed.data)).context }; }
  catch (error) { return failure(error, "Could not load the preview. Please retry."); }
}

const undoSnapshotSchema = z.object({
  version: z.literal(1), programId: z.string(),
  created: z.array(z.object({ id: z.string(), name: z.string(), studentCount: z.number(), updatedAt: z.string() })),
  updated: z.array(z.object({ id: z.string(), before: z.number(), after: z.number(), updatedAt: z.string(), dependencies: z.object(countsSelectToShape()) })),
});
function countsSelectToShape() { return { schedules: z.number(), students: z.number(), examinations: z.number(), subjectAssignments: z.number() }; }

export async function generateSectionBatch(scope: Scope, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the student totals, maximum, and preview before generating." };
  const d = parsed.data;
  try {
    return await prisma.$transaction(async (tx) => {
      const data = await load(tx, scope, d);
      if (data.context.fingerprint !== d.fingerprint) throw new GenerationError(STALE);
      const plan = planSectionGeneration({ ...d, prefix: d.pattern === "CODE" ? data.program.code : data.program.name,
        yearNumber: YEAR_LEVELS.indexOf(d.yearLevel) + 1,
      }, data.context.existing, data.context.reservedNames);
      if (!plan.ok) throw new GenerationError(plan.error);
      if (!plan.created && !plan.updated) throw new GenerationError("No changes are needed for these settings.");
      const newRows = plan.rows.filter((r) => r.status === "NEW");
      // Section names are unique across the term, even when another program uses the same prefix.
      if (newRows.length && await tx.section.findFirst({ where: { semesterId: d.semesterId, name: { in: newRows.map((r) => r.name), mode: "insensitive" } }, select: { id: true } })) {
        throw new GenerationError("A proposed section name is already in use in this term. Refresh the preview or change the naming pattern.");
      }
      const batchId = crypto.randomUUID(), changedAt = new Date();
      const updated = [];
      for (const row of plan.rows.filter((r) => r.status === "UPDATED")) {
        const before = data.sections.find((s) => s.id === row.id)!;
        await tx.section.update({ where: { id: before.id }, data: { studentCount: row.proposed, updatedAt: changedAt } });
        updated.push({ id: before.id, before: before.studentCount, after: row.proposed, updatedAt: changedAt.toISOString(), dependencies: before._count });
      }
      const startOrder = Math.max(-1, ...data.allSections.map((s) => s.sortOrder)) + 1;
      const created = newRows.map((r, index) => ({ id: crypto.randomUUID(), name: r.name, studentCount: r.proposed,
        level: "COLLEGE" as const, programId: d.programId, departmentId: data.program.departmentId, yearLevel: d.yearLevel,
        semesterId: d.semesterId, generationBatchId: batchId, sortOrder: startOrder + index, updatedAt: changedAt,
      }));
      if (created.length) await tx.section.createMany({ data: created });
      const placeholders = d.linkCurriculum ? created.flatMap((s) => data.subjects.flatMap((subject) => [
        ...(subject.lectureHours > 0 ? [{ sectionId: s.id, subjectId: subject.id, component: "LECTURE" as const }] : []),
        ...(subject.labHours > 0 ? [{ sectionId: s.id, subjectId: subject.id, component: "LABORATORY" as const }] : []),
      ])) : [];
      if (placeholders.length) await tx.sectionClassPlaceholder.createMany({ data: placeholders, skipDuplicates: true });
      await tx.auditLog.create({ data: {
        userId: scope.userId, role: scope.role, departmentId: data.program.departmentId, entity: "SectionGeneration", entityId: batchId,
        action: "Generated sections", newValue: { version: 1, programId: d.programId, yearLevel: d.yearLevel, semesterId: d.semesterId,
          mode: d.mode, balanced: d.balanced, totalLearners: d.totalLearners, maximum: d.maximum,
          created: created.map((s) => ({ id: s.id, name: s.name, studentCount: s.studentCount, updatedAt: changedAt.toISOString() })), updated,
        },
      } });
      return { ok: true as const, batchId, created: created.length, updated: updated.length, total: plan.total };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
  } catch (error) { return failure(error); }
}

function failure(error: unknown, fallback = "Could not save the section changes. Please retry.") {
  if (error instanceof GenerationError) return { ok: false as const, error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { ok: false as const, error: ["P2002", "P2034"].includes(error.code) ? STALE : "Could not save the section changes. Please retry." };
  }
  console.error("Section generation failed", error);
  return { ok: false as const, error: fallback };
}

export async function undoSectionBatch(scope: Scope, batchId: string) {
  if (!batchId || batchId.length > 100) return { ok: false as const, error: "Generation batch is missing." };
  try {
    return await prisma.$transaction(async (tx) => {
      const audit = await tx.auditLog.findFirst({ where: { entity: "SectionGeneration", entityId: batchId, action: "Generated sections" } });
      if (!audit) throw new GenerationError("This generation batch is no longer available to undo.");
      const snapshot = undoSnapshotSchema.safeParse(audit.newValue);
      if (!snapshot.success) throw new GenerationError("This generation batch cannot be undone automatically.");
      if (!allowed(scope, audit.departmentId, snapshot.data.programId)) throw new GenerationError("You can only undo generation in your assigned departments and programs.");
      if (await tx.auditLog.findFirst({ where: { entity: "SectionGeneration", entityId: batchId, action: "Undid section generation" }, select: { id: true } })) throw new GenerationError("This batch was already undone.");
      const { created, updated } = snapshot.data;
      const rows = await tx.section.findMany({ where: { id: { in: [...created, ...updated].map((s) => s.id) } }, select: sectionSelect });
      if (rows.length !== created.length + updated.length) throw new GenerationError("Some sections have changed or were removed. Undo is unavailable.");
      for (const row of rows) {
        if (!allowed(scope, row.departmentId, row.programId ?? "") || row.archivedAt) throw new GenerationError("A section is no longer editable. Undo is unavailable.");
        const made = created.find((s) => s.id === row.id), changed = updated.find((s) => s.id === row.id);
        const saved = made ?? changed!;
        if (row.updatedAt.toISOString() !== saved.updatedAt || row.studentCount !== (made?.studentCount ?? changed!.after)) throw new GenerationError("A section was edited after generation. Undo is unavailable.");
        if (made && (row.generationBatchId !== batchId || Object.values(row._count).some(Boolean))) throw new GenerationError("A new section already has enrolled students, scheduled classes, exams, or subject assignments. Undo is unavailable.");
        if (changed && (row._count.students > changed.before || Object.keys(countsSelect).some((key) => row._count[key as keyof typeof row._count] !== changed.dependencies[key as keyof typeof changed.dependencies]))) throw new GenerationError("A section’s enrollments or classes changed after generation. Undo is unavailable.");
      }
      for (const row of updated) await tx.section.update({ where: { id: row.id }, data: { studentCount: row.before } });
      if (created.length) await tx.section.deleteMany({ where: { id: { in: created.map((s) => s.id) }, generationBatchId: batchId } });
      await tx.auditLog.create({ data: { userId: scope.userId, role: scope.role, departmentId: audit.departmentId,
        entity: "SectionGeneration", entityId: batchId, action: "Undid section generation", newValue: { restored: updated.length, removed: created.length },
      } });
      return { ok: true as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
  } catch (error) { return failure(error); }
}
