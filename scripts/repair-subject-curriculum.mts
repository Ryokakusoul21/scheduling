import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { offeringMatches } from "../lib/subjects/offerings";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
    const year = await tx.academicYear.findFirstOrThrow({ where: { isActive: true }, orderBy: { startDate: "desc" } });
    const sections = await tx.section.findMany({ where: { archivedAt: null, level: "COLLEGE", semester: { academicYearId: year.id } }, include: { semester: true } });
    const subjects = await tx.subject.findMany({ where: { archivedAt: null, level: "COLLEGE" }, include: { sharedPrograms: { select: { id: true } } } });
    const ids = sections.map((s) => s.id);
    const before = await tx.sectionClassPlaceholder.findMany({ where: { sectionId: { in: ids } }, orderBy: { id: "asc" } });
    const key = (r: { sectionId: string; subjectId: string; component: string }) => `${r.sectionId}|${r.subjectId}|${r.component}`;
    const existing = new Set(before.map(key));
    const missing: Prisma.SectionClassPlaceholderCreateManyInput[] = [];
    for (const section of sections) {
      if (!section.semester) continue;
      for (const subject of subjects) {
        if (!offeringMatches({ ...subject, sharedProgramIds: subject.sharedPrograms.map((p) => p.id) }, section, section.semester)) continue;
        if (subject.lectureHours > 0) missing.push({ sectionId: section.id, subjectId: subject.id, component: "LECTURE" });
        if (subject.labHours > 0) missing.push({ sectionId: section.id, subjectId: subject.id, component: "LABORATORY" });
      }
    }
    const additions = missing.filter((r) => !existing.has(key(r)));
    const ge2 = subjects.find((s) => s.code === "GE2");
    const preview = { academicYear: year.name, sections: sections.length, missingComponents: additions.length, ge2SectionsRepaired: new Set(additions.filter((r) => r.subjectId === ge2?.id).map((r) => r.sectionId)).size };
    if (!process.argv.includes("--apply") || !additions.length) return { ...preview, applied: false };
    const teaching = async () => ({
      schedules: await tx.schedule.findMany({ where: { sectionId: { in: ids } }, orderBy: { id: "asc" } }),
      assignments: await tx.subjectAssignment.findMany({ where: { sectionId: { in: ids } }, orderBy: { id: "asc" } }),
      faculty: await tx.faculty.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, archivedAt: true } }),
    });
    const saved = await teaching();
    const directory = resolve("uploads/curriculum-backups");
    await mkdir(directory, { recursive: true });
    const backupPath = resolve(directory, `assignment-queue-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify({ academicYear: year, placeholders: before, ...saved }, null, 2), { flag: "wx" });
    const created = await tx.sectionClassPlaceholder.createMany({ data: additions, skipDuplicates: true });
    assert.equal(created.count, additions.length);
    assert.deepEqual(await teaching(), saved, "Classes, assignments and faculty status must remain unchanged");
    assert.deepEqual(await tx.sectionClassPlaceholder.findMany({ where: { id: { in: before.map((r) => r.id) } }, orderBy: { id: "asc" } }), before, "Existing queue choices must remain unchanged");
    await tx.auditLog.create({ data: { action: "Repaired missing subject curriculum queue links", entity: "SectionClassPlaceholder", reason: "User authorized curriculum-based subject assignment and automatic Unscheduled queue links.", newValue: { ...preview, created: created.count, backupPath } } });
    return { ...preview, applied: true, created: created.count, backupPath, preservedClasses: saved.schedules.length, preservedAssignments: saved.assignments.length };
  }, { isolationLevel: "Serializable", timeout: 120_000, maxWait: 10_000 });
  console.log(JSON.stringify(result, null, 2));
} finally { await db.$disconnect(); }
