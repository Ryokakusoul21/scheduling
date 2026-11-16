import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
config({ path: ".env.local", quiet: true }); config({ quiet: true });

// Read-only by default; --transaction also checks inserts inside a transaction that always rolls back.
const { prisma } = await import("../lib/db/prisma");
const { serverInput } = await import("../lib/scheduler/resolver/server");
const { solve } = await import("../lib/scheduler/resolver/solver");
const { DEFAULT_OPTIONS } = await import("../lib/scheduler/resolver/types");
const { validateAutoPlacements } = await import("../lib/scheduler/auto-schedule");
try {
  const program = await prisma.program.findFirstOrThrow({ where: { code: "BSIT" } });
  const sections = await prisma.section.findMany({ where: { programId: program.id, yearLevel: "FIRST", archivedAt: null, semester: { isActive: true } }, select: { id: true, semesterId: true } });
  const scope = { userId: "read-only-verification", role: "HEAD_OF_DEPARTMENT", status: "ACTIVE", archivedAt: null, departmentId: program.departmentId, departmentIds: program.departmentId ? [program.departmentId] : [], programIds: [program.id], isAdmin: false, facultyId: null, name: "Read-only verification", actingDepartmentIds: [], manageDepartmentId: program.departmentId } as const;
  const input = await serverInput({ ...scope, departmentIds: [...scope.departmentIds], programIds: [...scope.programIds], actingDepartmentIds: [] }, [...new Set(sections.map((s) => s.semesterId!))]);
  const proposal = solve(input, { ...DEFAULT_OPTIONS, sectionIds: sections.map((s) => s.id), kinds: ["UNSCHEDULED", "HOURS"], placementOnly: true, keepFaculty: true, retime: false, moveCompleteSections: false });
  validateAutoPlacements(input, proposal.changes);
  if (process.argv.includes("--transaction") && proposal.changes.length) {
    const checked = proposal.changes.map((c) => ({ ...c, after: { ...c.after!, id: randomUUID() } }));
    class VerifiedRollback extends Error {}
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
        const fresh = await serverInput({ ...scope, departmentIds: [...scope.departmentIds], programIds: [...scope.programIds], actingDepartmentIds: [] }, [...new Set(sections.map((s) => s.semesterId!))], tx);
        validateAutoPlacements(fresh, checked);
        const created = await tx.schedule.createMany({ data: checked.map((c) => ({ ...c.after, departmentId: program.departmentId, notes: "Rollback-only integration check" })) });
        assert.equal(created.count, checked.length);
        throw new VerifiedRollback();
      }, { isolationLevel: "Serializable", timeout: 60_000 });
    } catch (error) { if (!(error instanceof VerifiedRollback)) throw error; }
    assert.equal(await prisma.schedule.count({ where: { id: { in: checked.map((c) => c.after.id) } } }), 0);
    console.log(`Verified ${checked.length} draft inserts and transaction lock; every verification insert was rolled back.`);
  }
  console.log(JSON.stringify({ sections: sections.length, requiredComponents: input.sections.filter((s) => sections.some((r) => r.id === s.id)).reduce((sum, s) => sum + s.curriculum.length, 0), proposedDraftMeetings: proposal.changes.length, proposedHours: proposal.changes.reduce((sum, c) => sum + (c.after!.endMin - c.after!.startMin) / 60, 0), blocked: proposal.unresolved.map((u) => ({ reason: u.reason, sectionId: u.issue.sectionId })), existingMeetingsMoved: proposal.classesMoved, stoppedEarly: proposal.stoppedEarly, savedMeetings: 0 }));
} finally { await prisma.$disconnect(); }
