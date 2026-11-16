import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import assert from "node:assert/strict";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const client = new Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const name = "20261114060000_assignment_curriculum_queue";
await client.connect();
try {
  const migration = (await readFile(`prisma/migrations/${name}/migration.sql`, "utf8")).replace(/^BEGIN;|^COMMIT;/gm, "");
  if (process.argv.includes("--preview")) {
    await client.query("BEGIN");
    const snapshot = async () => (await client.query(`SELECT
      (SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY a."id")::text) FROM "SubjectAssignment" a) AS assignments,
      (SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY s."id")::text) FROM "Schedule" s) AS meetings`)).rows[0];
    const before = await snapshot();
    const queue = await client.query('SELECT "id", to_jsonb(cp) AS value FROM "SectionClassPlaceholder" cp ORDER BY "id"');
    await client.query(migration);
    assert.deepEqual(await snapshot(), before, "Assignments and saved meetings must be preserved");
    const kept = await client.query('SELECT "id", to_jsonb(cp) AS value FROM "SectionClassPlaceholder" cp WHERE "id"=ANY($1::text[]) ORDER BY "id"', [queue.rows.map((r) => r.id)]);
    assert.deepEqual(kept.rows, queue.rows, "Existing queue rows and remembered choices must be preserved");
    console.log("Verified: assignments, meetings and existing queue choices are unchanged.");
  }
  if (process.argv.includes("--apply")) {
    const applied = await client.query('SELECT "id" FROM "_prisma_migrations" WHERE "migration_name"=$1 AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL', [name]);
    if (!applied.rowCount) {
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "execute", "--file", `prisma/migrations/${name}/migration.sql`], { env: process.env, stdio: "inherit" });
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "resolve", "--applied", name], { env: process.env, stdio: "inherit" });
    }
  }
  const result = await client.query(`SELECT p."code" AS program, count(*)::int AS assignments,
    count(*) FILTER (WHERE (sub."lectureHours" > 0 AND NOT EXISTS (SELECT 1 FROM "SectionClassPlaceholder" cp WHERE cp."sectionId"=s."id" AND cp."subjectId"=sub."id" AND cp."component"='LECTURE'))
      OR (sub."labHours" > 0 AND NOT EXISTS (SELECT 1 FROM "SectionClassPlaceholder" cp WHERE cp."sectionId"=s."id" AND cp."subjectId"=sub."id" AND cp."component"='LABORATORY')))::int AS "missingQueueLinks"
    FROM "SubjectAssignment" a JOIN "Section" s ON s."id"=a."sectionId" JOIN "Subject" sub ON sub."id"=a."subjectId" LEFT JOIN "Program" p ON p."id"=s."programId"
    WHERE a."status"='ACTIVE' AND s."archivedAt" IS NULL AND sub."archivedAt" IS NULL GROUP BY p."code" ORDER BY p."code"`);
  console.log(JSON.stringify({ previewOnly: process.argv.includes("--preview"), programs: result.rows }));
} finally { await client.query("ROLLBACK").catch(() => {}); await client.end(); }
