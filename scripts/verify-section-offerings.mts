import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const client = new Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
await client.connect();
try {
  const migration = (await readFile("prisma/migrations/20261114050000_section_subject_offerings/migration.sql", "utf8")).replace(/^BEGIN;|^COMMIT;/gm, "");
  if (process.argv.includes("--apply")) {
    const name = "20261114050000_section_subject_offerings";
    const applied = await client.query('SELECT "id" FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL', [name]);
    if (!applied.rowCount) {
      // Apply only this migration; leave any other pending work in the shared tree untouched.
      const options = { env: process.env, stdio: "inherit" as const };
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "execute", "--file", `prisma/migrations/${name}/migration.sql`], options);
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "resolve", "--applied", name], options);
    }
  }
  if (process.argv.includes("--workload")) {
    // Run with: npx tsx --conditions=react-server scripts/verify-section-offerings.mts --workload
    const { prisma } = await import("../lib/db/prisma");
    try {
      const { loadWorkload } = await import("../lib/workload/load");
      const { hoursOf } = await import("../lib/workload/optimizer");
      const terms = await prisma.subjectAssignment.findMany({ where: { status: "ACTIVE" }, distinct: ["semesterId"], select: { semesterId: true } });
      const data = await loadWorkload(terms.map((t) => t.semesterId), null);
      console.log(JSON.stringify({ assignmentGroups: data.assignments.length, weeklyTeachingHours: data.assignments.reduce((sum, a) => sum + hoursOf(a), 0) }));
    } finally { await prisma.$disconnect(); }
  } else if (process.argv.includes("--current") || process.argv.includes("--preview") || process.argv.includes("--apply")) {
    if (process.argv.includes("--preview")) {
      await client.query("BEGIN");
      const before = await client.query('SELECT "id", "facultyId", "sectionId" FROM "SubjectAssignment" WHERE "status" = \'ACTIVE\' AND "sectionId" IS NOT NULL');
      await client.query(migration);
      for (const row of before.rows) {
        const saved = await client.query('SELECT "facultyId" FROM "SubjectAssignment" WHERE "id" = $1 AND "status" = \'ACTIVE\'', [row.id]);
        assert.equal(saved.rows[0]?.facultyId, row.facultyId, "Existing section teacher must be preserved");
      }
    }
    const { rows } = await client.query(`SELECT
      count(*) FILTER (WHERE "status" = 'ACTIVE' AND "sectionId" IS NULL)::int AS "activeDefaults",
      count(*) FILTER (WHERE "status" = 'ACTIVE' AND "sectionId" IS NOT NULL)::int AS "activeOfferings"
      FROM "SubjectAssignment"`);
    const bySubject = await client.query(`SELECT sub."code", count(*)::int AS "sectionOfferings", sum(sub."lectureHours" + sub."labHours") AS "weeklyCurriculumHours"
      FROM "SubjectAssignment" a JOIN "Subject" sub ON sub."id" = a."subjectId"
      WHERE a."status" = 'ACTIVE' AND a."sectionId" IS NOT NULL GROUP BY sub."code" ORDER BY sub."code"`);
    const byProgram = await client.query(`SELECT p."code" AS program, count(*)::int AS "sectionOfferings", sum(sub."lectureHours" + sub."labHours") AS "weeklyCurriculumHours"
      FROM "SubjectAssignment" a JOIN "Subject" sub ON sub."id" = a."subjectId" JOIN "Section" s ON s."id" = a."sectionId" LEFT JOIN "Program" p ON p."id" = s."programId"
      WHERE a."status" = 'ACTIVE' GROUP BY p."code" ORDER BY p."code"`);
    console.log(JSON.stringify({ ...rows[0], bySubject: bySubject.rows, byProgram: byProgram.rows, ...(process.argv.includes("--preview") ? { previewOnly: true, explicitTeachersPreserved: true } : {}) }));
  } else {
    // All fixtures and migration writes are confined to temporary tables and rolled back.
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path = pg_temp, public");
    await client.query(`
      CREATE TEMP TABLE "SubjectAssignment" AS SELECT "id", "subjectId", "facultyId", "sectionId", "semesterId", "status", "assignedById", "createdAt", "updatedAt" FROM public."SubjectAssignment" WITH NO DATA;
      CREATE TEMP TABLE "Subject" AS SELECT "id", "level", "programId", "yearLevel", "gradeLevel", "semester", "archivedAt" FROM public."Subject" WITH NO DATA;
      CREATE TEMP TABLE "Semester" AS SELECT "id", "type", "level", "programId" FROM public."Semester" WITH NO DATA;
      CREATE TEMP TABLE "Section" AS SELECT "id", "level", "programId", "yearLevel", "gradeLevel", "semesterId", "archivedAt" FROM public."Section" WITH NO DATA;
      CREATE TEMP TABLE "SectionClassPlaceholder" AS SELECT "sectionId", "subjectId" FROM public."SectionClassPlaceholder" WITH NO DATA;
      CREATE TEMP TABLE "_SharedSubjectPrograms" AS SELECT "A", "B" FROM public."_SharedSubjectPrograms" WITH NO DATA;
      CREATE UNIQUE INDEX "offering_fixture_unique" ON "SubjectAssignment" ("subjectId", "sectionId", "semesterId") NULLS NOT DISTINCT WHERE "status" = 'ACTIVE';
      INSERT INTO "Semester" VALUES ('t1', 'FIRST', 'COLLEGE', NULL), ('t2', 'SECOND', 'COLLEGE', NULL);
      INSERT INTO "Subject" VALUES ('cc101', 'COLLEGE', 'p1', 'FIRST', NULL, 'FIRST', NULL), ('shared', 'COLLEGE', NULL, 'FIRST', NULL, 'FIRST', NULL), ('absent', 'COLLEGE', 'missing', 'FIRST', NULL, 'FIRST', NULL);
      INSERT INTO "_SharedSubjectPrograms" VALUES ('p1', 'shared');
      INSERT INTO "Section" SELECT 's' || n, 'COLLEGE', 'p1', 'FIRST', NULL, 't1', NULL FROM generate_series(1,8) n;
      INSERT INTO "Section" VALUES
        ('wrong-year', 'COLLEGE', 'p1', 'SECOND', NULL, 't1', NULL),
        ('wrong-term', 'COLLEGE', 'p1', 'FIRST', NULL, 't2', NULL),
        ('wrong-program', 'COLLEGE', 'p2', 'FIRST', NULL, 't1', NULL),
        ('archived', 'COLLEGE', 'p1', 'FIRST', NULL, 't1', CURRENT_TIMESTAMP),
        ('unlinked', 'COLLEGE', 'p1', 'FIRST', NULL, 't1', NULL);
      INSERT INTO "SectionClassPlaceholder" VALUES ('unlinked', 'other');
      INSERT INTO "SubjectAssignment" VALUES
        ('default', 'cc101', 'ana', NULL, 't1', 'ACTIVE', 'head', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('override', 'cc101', 'ben', 's2', 't1', 'ACTIVE', 'head', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('shared-default', 'shared', 'ana', NULL, 't1', 'ACTIVE', 'head', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('no-sections', 'absent', 'ana', NULL, 't1', 'ACTIVE', 'head', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
    await client.query(migration);
    const { rows } = await client.query('SELECT "subjectId", "facultyId", "sectionId" FROM "SubjectAssignment" WHERE "status" = \'ACTIVE\' ORDER BY "subjectId", "sectionId"');
    assert.equal(rows.length, 16);
    assert.equal(rows.filter((r) => r.subjectId === "cc101").length, 8);
    assert.equal(rows.find((r) => r.subjectId === "cc101" && r.sectionId === "s2")?.facultyId, "ben");
    assert(rows.every((r) => /^s[1-8]$/.test(r.sectionId)));
    const archived = await client.query('SELECT count(*)::int AS n FROM "SubjectAssignment" WHERE "status" = \'ARCHIVED\' AND "sectionId" IS NULL');
    assert.equal(archived.rows[0].n, 3);
    await client.query(`INSERT INTO "Section" VALUES ('future', 'COLLEGE', 'p1', 'FIRST', NULL, 't1', NULL)`);
    const future = await client.query('SELECT count(*)::int AS n FROM "SubjectAssignment" WHERE "sectionId" = \'future\'');
    assert.equal(future.rows[0].n, 0);
    await client.query("SAVEPOINT constraint_check");
    await assert.rejects(client.query(`INSERT INTO "SubjectAssignment" ("id", "subjectId", "facultyId", "semesterId", "status") VALUES ('new-default', 'cc101', 'ana', 't1', 'ACTIVE')`), { code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT constraint_check");
    await client.query("ROLLBACK");
    console.log("Migration verified: 8 offerings per subject; section overrides, curriculum, term, year, program, archive, and future-section isolation preserved; active defaults rejected. All fixtures rolled back.");
  }
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
