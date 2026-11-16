import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// The user authorized generated employee IDs. Emails are explicitly undeliverable
// placeholders because the source PDF contains no email addresses. No accounts are created.
config({ path: ".env.local", quiet: true }); config({ quiet: true });
const people = [
  "Ms. Septy Rodriguez", "Ms. Corazon L. Madriaga", "Mr. Raymundo S. Barerra Jr.",
  "Ms. Otesa C. Manalo", "Ms. Tablasan", "Mr. Glen Calvin Doce", "Dr. Mercurio G. Villanueva",
];
const normalize = (name: string) => name.toLowerCase().replace(/^(mr|mrs|ms|dr)\.\s*/, "").replace(/[^a-z0-9]/g, "");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
    const existing = await tx.faculty.findMany({ orderBy: { id: "asc" } });
    const missing = people.filter(name => !existing.some(f => normalize(f.fullName) === normalize(name)));
    const data = missing.map(fullName => ({
      fullName, employeeId: `GC-REF-${randomUUID().slice(0, 8).toUpperCase()}`,
      email: `${fullName.replace(/^(Mr|Ms|Dr)\.\s*/, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/\.$/, "")}@faculty.invalid`,
      teachingLevels: ["COLLEGE" as const], status: "ACTIVE" as const,
    }));
    assert.equal(new Set(data.map(f => f.employeeId)).size, data.length);
    assert.ok(data.every(f => !existing.some(e => e.email === f.email || e.employeeId === f.employeeId)));
    if (!process.argv.includes("--apply") || !data.length) return { applied: false, faculty: data, alreadyRegistered: people.length - missing.length };
    const directory = resolve("uploads/professor-assignment-backups");
    await mkdir(directory, { recursive: true });
    const backupPath = resolve(directory, `faculty-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify({ faculty: existing, planned: data }, null, 2), { flag: "wx" });
    await tx.faculty.createMany({ data });
    const created = await tx.faculty.findMany({ where: { employeeId: { in: data.map(f => f.employeeId) } } });
    assert.equal(created.length, data.length);
    assert.deepEqual(await tx.faculty.findMany({ where: { id: { in: existing.map(f => f.id) } }, orderBy: { id: "asc" } }), existing);
    await tx.auditLog.createMany({ data: created.map(f => ({
      action: "Registered professor from official class schedule", entity: "Faculty", entityId: f.id,
      reason: "User requested real professor assignments and generated employee IDs. PDF has no email; .invalid address is an undeliverable placeholder. Department and employment details were not supplied; existing system defaults apply.",
      newValue: { fullName: f.fullName, employeeId: f.employeeId, email: f.email, placeholderEmail: true, source: "UPDATED CLASS SCHEDULE 1ST SEM SY2627.pdf", backupPath },
    })) });
    return { applied: true, faculty: created.map(f => ({ id: f.id, fullName: f.fullName, employeeId: f.employeeId, email: f.email })), backupPath };
  }, { isolationLevel: "Serializable", timeout: 120_000, maxWait: 10_000 });
  console.log(JSON.stringify(result, null, 2));
} finally { await db.$disconnect(); }
