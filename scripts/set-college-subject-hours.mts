import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { subjectAppliesToSection } from "../lib/scheduler/timetable";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes("--apply");

try {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
    const subjects = await tx.subject.findMany({ orderBy: { id: "asc" }, include: { sharedPrograms: { select: { id: true } } } });
    const college = subjects.filter((s) => s.level === "COLLEGE");
    const changes = college.filter((s) => s.lectureHours + s.labHours !== 3).map((subject) => {
      // Match the subject editor: preserve laboratory hours within the new total.
      const labHours = subject.labHours > 0 ? Math.min(subject.labHours, 3)
        : subject.requiredRoomType.endsWith("LABORATORY") && subject.lectureHours === 0 ? 3 : 0;
      return { subject, lectureHours: 3 - labHours, labHours };
    });
    const sections = await tx.section.findMany({ where: { level: "COLLEGE", archivedAt: null }, include: { semester: true } });
    const queue: Prisma.SectionClassPlaceholderCreateManyInput[] = [];
    for (const { subject, lectureHours, labHours } of changes) {
      if (subject.archivedAt) continue;
      for (const section of sections) {
        const term = section.semester;
        if (!term || term.level !== "COLLEGE" || (term.programId && term.programId !== section.programId) ||
          (subject.semester && subject.semester !== term.type) ||
          !subjectAppliesToSection({ ...subject, sharedProgramIds: subject.sharedPrograms.map((p) => p.id) }, section)) continue;
        if (lectureHours > 0) queue.push({ sectionId: section.id, subjectId: subject.id, component: "LECTURE" });
        if (labHours > 0) queue.push({ sectionId: section.id, subjectId: subject.id, component: "LABORATORY" });
      }
    }
    const preview = { collegeSubjects: college.length, currentCollegeSubjects: college.filter((s) => !s.archivedAt).length,
      subjectsToUpdate: changes.length, hoursPerWeek: 3, queueCandidates: queue.length };
    if (!apply || !changes.length) return { ...preview, applied: false };

    const ids = college.map((s) => s.id);
    const readTeaching = async () => ({
      schedules: await tx.schedule.findMany({ where: { subjectId: { in: ids } }, orderBy: { id: "asc" } }),
      assignments: await tx.subjectAssignment.findMany({ where: { subjectId: { in: ids } }, orderBy: { id: "asc" } }),
    });
    const teaching = await readTeaching();
    const placeholders = await tx.sectionClassPlaceholder.findMany({ where: { subjectId: { in: ids } }, orderBy: { id: "asc" } });
    const directory = resolve("uploads/subject-hours-backups");
    await mkdir(directory, { recursive: true });
    const backupPath = resolve(directory, `college-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify({ subjects, placeholders, ...teaching }, null, 2), { flag: "wx" });
    for (const { subject, lectureHours, labHours } of changes) {
      await tx.subject.update({ where: { id: subject.id }, data: { lectureHours, labHours } });
    }
    const added = queue.length ? (await tx.sectionClassPlaceholder.createMany({ data: queue, skipDuplicates: true })).count : 0;
    const after = await tx.subject.findMany({ orderBy: { id: "asc" }, include: { sharedPrograms: { select: { id: true } } } });
    for (let i = 0; i < subjects.length; i++) {
      const change = changes.find((c) => c.subject.id === subjects[i].id);
      assert.deepEqual(after[i], change ? { ...subjects[i], lectureHours: change.lectureHours, labHours: change.labHours, updatedAt: after[i].updatedAt } : subjects[i]);
    }
    assert.ok(after.filter((s) => s.level === "COLLEGE").every((s) => s.lectureHours + s.labHours === 3));
    assert.deepEqual(await readTeaching(), teaching, "Existing schedules and assignments must remain unchanged");
    assert.deepEqual(await tx.sectionClassPlaceholder.findMany({ where: { id: { in: placeholders.map((p) => p.id) } }, orderBy: { id: "asc" } }), placeholders);
    await tx.auditLog.create({ data: { action: "Set all college subjects to 3 weekly hours", entity: "Subject",
      reason: "User requested all college subjects have 3 hours per week.",
      oldValue: changes.map(({ subject }) => ({ id: subject.id, code: subject.code, lectureHours: subject.lectureHours, labHours: subject.labHours })),
      newValue: { hoursPerWeek: 3, updatedSubjects: changes.length, queueComponentsAdded: added, backupPath },
    } });
    return { ...preview, applied: true, queueComponentsAdded: added, backupPath, preservedClasses: teaching.schedules.length, preservedAssignments: teaching.assignments.length };
  }, { timeout: 120_000, maxWait: 10_000, isolationLevel: "Serializable" });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.$disconnect();
}
