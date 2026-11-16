import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { offeringMatches } from "../lib/subjects/offerings";

// Preview: node --conditions=react-server --import tsx scripts/assign-professors-from-reference.mts
// Apply confirmed matches by adding --apply. Missing identities are reported, never fabricated.
config({ path: ".env.local", quiet: true });
config({ quiet: true });
const { syncAssignedCurriculum } = await import("../lib/subjects/assignment-curriculum");
const { handOverClasses } = await import("../lib/subjects/hand-over");
const source = JSON.parse(await readFile(new URL("../prisma/data/class-schedule-first-sem-2026-2027.json", import.meta.url), "utf8")) as {
  source: string; sha256: string; academicYear: string; semester: "FIRST";
  rows: { page: number; section: string; code: string; title: string; units: number; instructor: string | null }[];
};
const normalize = (name: string) => name.toLowerCase().replace(/^(mr|mrs|ms|dr|prof)\.\s*/, "").replace(/[^a-z0-9]/g, "");
// Only unambiguous shortened names in this PDF; spelling and surname differences stay unresolved.
const aliases: Record<string, string> = {
  "Ms. Loren Olino": "Ms. Loren B. Olino",
  "Mr. Jonnel Bilaos": "Mr. Jonnel M. Bilaos",
  "Mr. Jude Allan Pabiton": "Mr. Jude Allan C. Pabiton",
  "Mr. Arby Miranda": "Mr. Arby R. Miranda",
  "Mr. Calvin Doce": "Mr. Glen Calvin Doce",
};
// User-confirmed corrections take precedence over the PDF; preserve its original text.
const corrections: Record<string, string> = { "BSIT2F|GE5": "Ms. Joynelyn Gatchalian" };
const confirmedUnassigned = new Set(["BSIT4A|ITC22", "BSIT4B|ITC22", "BSIT4C|ITC22", "BSCS4A|CSC401"]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
    const terms = await tx.semester.findMany({ where: { academicYear: { name: source.academicYear }, type: source.semester, level: "COLLEGE" } });
    const [sections, subjects, faculty] = await Promise.all([
      tx.section.findMany({ where: { semesterId: { in: terms.map(t => t.id) }, archivedAt: null }, include: { program: true } }),
      tx.subject.findMany({ where: { archivedAt: null, level: "COLLEGE" }, include: { sharedPrograms: { select: { id: true } } } }),
      tx.faculty.findMany({ where: { archivedAt: null, status: "ACTIVE", teachingLevels: { has: "COLLEGE" } } }),
    ]);
    assert.ok(terms.length, "The reference academic year and semester must already exist");
    assert.equal(source.rows.length, 167, "Expected all 167 subject rows from the 25-page PDF");
    assert.equal(new Set(source.rows.map(r => r.section)).size, 25);
    const sectionKey = (s: typeof sections[number]) => {
      const match = s.name.match(/(\d+)\s*[-–]?\s*([A-Z])\s*$/i);
      return match ? `${s.program?.code}${match[1]}${match[2].toUpperCase()}` : "";
    };
    const unresolved: { page: number; section: string; code: string; instructor: string | null; reason: string }[] = [];
    const intentionallyUnassigned: typeof unresolved = [];
    const slots = source.rows.flatMap(row => {
      const candidates = sections.filter(s => sectionKey(s) === row.section);
      assert.equal(candidates.length, 1, `Expected one existing section for ${row.section}`);
      const section = candidates[0];
      const term = terms.find(t => t.id === section.semesterId)!;
      const subject = subjects.find(s => s.code === row.code);
      assert.ok(subject, `Missing existing subject ${row.code}`);
      assert.ok(offeringMatches({ ...subject, sharedProgramIds: subject.sharedPrograms.map(p => p.id) }, section, term), `Curriculum mismatch: ${row.section} ${row.code}`);
      const referenceKey = `${row.section}|${row.code}`;
      if (!row.instructor && confirmedUnassigned.has(referenceKey)) {
        intentionallyUnassigned.push({ ...row, reason: "User confirmed no professor should be assigned" });
        return [];
      }
      const instructor = corrections[referenceKey] ?? row.instructor;
      const people = instructor ? faculty.filter(f => normalize(f.fullName) === normalize(aliases[instructor] ?? instructor)) : [];
      if (people.length !== 1) {
        unresolved.push({ page: row.page, section: row.section, code: row.code, instructor: row.instructor,
          reason: !row.instructor ? "No instructor listed in PDF" : people.length ? "Ambiguous faculty identity" : "No matching active college faculty record" });
        return [];
      }
      return [{ row, section, subject, faculty: people[0], subjectId: subject.id, sectionId: section.id, semesterId: term.id, facultyId: people[0].id }];
    });
    const key = (r: { subjectId: string; sectionId: string | null; semesterId: string }) => `${r.semesterId}|${r.sectionId}|${r.subjectId}`;
    assert.equal(new Set(slots.map(key)).size, slots.length, "Duplicate reference offering");
    const before = await tx.subjectAssignment.findMany({ orderBy: { id: "asc" } });
    for (const row of intentionallyUnassigned) {
      const section = sections.find(s => sectionKey(s) === row.section)!;
      const subject = subjects.find(s => s.code === row.code)!;
      assert.ok(!before.some(a => a.status === "ACTIVE" && a.sectionId === section.id && a.subjectId === subject.id && a.semesterId === section.semesterId), `Expected ${row.section} ${row.code} to remain unassigned`);
    }
    const meetings = await tx.schedule.findMany({ orderBy: { id: "asc" } });
    const placeholders = await tx.sectionClassPlaceholder.findMany({ orderBy: { id: "asc" } });
    const proposals = await tx.subjectAssignmentProposal.findMany({ orderBy: { id: "asc" } });
    const changes = slots.flatMap(s => {
      const previous = before.filter(a => a.status === "ACTIVE" && key(a) === key(s));
      assert.ok(previous.length <= 1, `Duplicate active assignment for ${key(s)}`);
      return previous[0]?.facultyId === s.facultyId ? [] : [{ ...s, previous: previous[0] }];
    });
    const mismatched = slots.filter(s => meetings.some(m => m.status !== "ARCHIVED" && key(m) === key(s) && m.facultyId !== s.facultyId));
    // A direct reference assignment supersedes conflicting proposals for exactly these offerings.
    const superseded = proposals.filter(p => p.status === "PENDING" && slots.some(s => key(s) === key(p) && s.facultyId !== p.facultyId));
    const preview = { source: source.source, sha256: source.sha256, academicYear: source.academicYear, semester: source.semester,
      referenceRows: source.rows.length, matched: slots.length, professors: new Set(slots.map(s => s.facultyId)).size,
      assignmentsToCreate: changes.filter(s => !s.previous).length, assignmentsToReplace: changes.filter(s => s.previous).length,
      classesToHandOver: mismatched.length, conflictingProposals: superseded.length, corrections, intentionallyUnassigned, unresolved };
    if (!process.argv.includes("--apply")) return { ...preview, applied: false };
    if (!changes.length && !mismatched.length && !superseded.length) return { ...preview, applied: false, alreadyApplied: true };
    const directory = resolve("uploads/professor-assignment-backups");
    await mkdir(directory, { recursive: true });
    const backupPath = resolve(directory, `reference-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(backupPath, JSON.stringify({ source, assignments: before, schedules: meetings, placeholders, proposals, faculty }, null, 2), { flag: "wx" });
    const replaced = changes.flatMap(s => s.previous ? [s.previous.id] : []);
    if (replaced.length) await tx.subjectAssignment.updateMany({ where: { id: { in: replaced } }, data: { status: "ARCHIVED" } });
    if (changes.length) await tx.subjectAssignment.createMany({ data: changes.map(s => ({ subjectId: s.subjectId, sectionId: s.sectionId, semesterId: s.semesterId, facultyId: s.facultyId })) });
    const queueAdded = await syncAssignedCurriculum(tx, slots.map(s => ({ subjectId: s.subjectId, sectionId: s.sectionId, semesterId: s.semesterId })));
    const warnings = await handOverClasses(tx, mismatched);
    assert.deepEqual(warnings, [], "A scheduled class could not follow its assigned professor; rolling back");
    if (superseded.length) await tx.subjectAssignmentProposal.updateMany({ where: { id: { in: superseded.map(p => p.id) } }, data: {
      status: "REJECTED", decidedAt: new Date(), decisionNote: `Superseded by the user's direct assignment from ${source.source}.`,
    } });
    const after = await tx.subjectAssignment.findMany({ orderBy: { id: "asc" } });
    for (const s of slots) {
      const current = after.filter(a => a.status === "ACTIVE" && key(a) === key(s));
      assert.equal(current.length, 1);
      assert.equal(current[0].facultyId, s.facultyId);
    }
    assert.deepEqual(after.filter(a => before.some(b => b.id === a.id) && !replaced.includes(a.id)), before.filter(a => !replaced.includes(a.id)), "Unrelated and historical assignments must be preserved");
    const afterMeetings = await tx.schedule.findMany({ orderBy: { id: "asc" } });
    const affected = new Set(mismatched.map(key));
    assert.deepEqual(afterMeetings.filter(m => m.status === "ARCHIVED" || !affected.has(key(m))), meetings.filter(m => m.status === "ARCHIVED" || !affected.has(key(m))), "Unrelated and archived classes must be preserved");
    for (const s of mismatched) assert.ok(afterMeetings.filter(m => key(m) === key(s) && m.status !== "ARCHIVED").every(m => m.facultyId === s.facultyId));
    assert.deepEqual(await tx.sectionClassPlaceholder.findMany({ where: { id: { in: placeholders.map(p => p.id) } }, orderBy: { id: "asc" } }), placeholders);
    await tx.auditLog.createMany({ data: changes.map(s => ({
      action: `Assigned ${s.subject.code} to ${s.faculty.fullName} (${s.section.name}) from reference`, entity: "SubjectAssignment", entityId: s.subjectId,
      departmentId: s.section.departmentId, reason: corrections[`${s.row.section}|${s.row.code}`]
        ? `User corrected the PDF typo for ${s.row.section} ${s.row.code} to ${s.faculty.fullName}.`
        : `User requested real professor assignments from ${source.source}, page ${s.row.page}.`,
      oldValue: s.previous ? { assignmentId: s.previous.id, facultyId: s.previous.facultyId } : Prisma.JsonNull,
      newValue: { sectionId: s.sectionId, semesterId: s.semesterId, facultyId: s.facultyId, sourcePage: s.row.page, sourceSha256: source.sha256, referenceInstructor: s.row.instructor, correctedInstructor: corrections[`${s.row.section}|${s.row.code}`] ?? null },
    })) });
    await tx.auditLog.create({ data: { action: "Imported professor assignments from official class schedule", entity: "SubjectAssignment", reason: "User requested real professor assignments using the supplied PDF.", newValue: { ...preview, backupPath, queueAdded } } });
    return { ...preview, applied: true, backupPath, queueAdded, classesHandedOver: mismatched.length };
  }, { isolationLevel: "Serializable", timeout: 120_000, maxWait: 10_000 });
  console.log(JSON.stringify(result, null, 2));
} finally { await db.$disconnect(); }
