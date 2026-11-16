import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { employeeIdSchema } from "../lib/faculty/employee-id";

export type RosterPerson = { fullName: string; employeeId?: string; email?: string; position?: string };
type ExistingFaculty = { id: string; fullName: string; employeeId: string; email: string; departmentId: string | null; archivedAt: Date | null };
export const COICS_DESIGNATED_HEAD = "Mr. Marvin A. Ramos";
export const rosterName = (name: string) => name.trim().replace(/^(mr|ms|mrs|dr)\.?\s+/i, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();

/** Build temporary profiles without inventing HR identifiers, contact details, or login authority. */
export function planCoicsFaculty(source: RosterPerson[], existing: ExistingFaculty[], departmentId: string) {
  if (source.length !== 16 || new Set(source.map((p) => rosterName(p.fullName))).size !== 16) throw new Error("The COICS roster must contain 16 unique supplied names.");
  if (!source.some((p) => rosterName(p.fullName) === rosterName(COICS_DESIGNATED_HEAD))) throw new Error("The designated head is missing from the supplied roster.");
  const keepIds: string[] = [];
  const create = source.flatMap((person, index) => {
    const matches = existing.filter((f) => rosterName(f.fullName) === rosterName(person.fullName));
    if (matches.length > 1) throw new Error(`Multiple profiles match ${person.fullName}. Resolve the duplicate before importing.`);
    if (matches[0]) {
      if (matches[0].departmentId !== departmentId || matches[0].archivedAt) throw new Error(`${person.fullName} has an existing profile outside the current COICS roster. Review it before importing.`);
      keepIds.push(matches[0].id);
      return [];
    }
    const number = String(index + 1).padStart(3, "0");
    const employeeId = employeeIdSchema.parse(person.employeeId?.trim() || `GC-COICS-TEMP-${number}`);
    const email = z.email().parse(person.email?.trim() || `coics-temp-${number}@faculty.invalid`);
    if (existing.some((f) => f.employeeId === employeeId || f.email.toLowerCase() === email.toLowerCase())) throw new Error(`A temporary identifier or email for ${person.fullName} is already in use.`);
    return [{
      fullName: person.fullName.trim(), employeeId, email, departmentId, status: "INACTIVE" as const,
      teachingLevels: ["COLLEGE" as const],
      position: rosterName(person.fullName) === rosterName(COICS_DESIGNATED_HEAD) ? "Head of Department (designated; account access pending)" : "Temporary faculty profile (details pending)",
    }];
  });
  if (new Set(create.map((p) => p.employeeId)).size !== create.length || new Set(create.map((p) => p.email.toLowerCase())).size !== create.length) throw new Error("The roster contains duplicate identifiers or emails.");
  return { create, keepIds, archiveIds: existing.filter((f) => f.departmentId === departmentId && !f.archivedAt && !keepIds.includes(f.id)).map((f) => f.id) };
}

type Db = Prisma.TransactionClient;
async function teachingRecords(db: Db, facultyIds: string[]) {
  const [schedules, assignments, exams] = await Promise.all([
    db.schedule.findMany({ where: { facultyId: { in: facultyIds } }, orderBy: { id: "asc" } }),
    db.subjectAssignment.findMany({ where: { facultyId: { in: facultyIds } }, orderBy: { id: "asc" } }),
    db.examination.findMany({ where: { proctorId: { in: facultyIds } }, orderBy: { id: "asc" } }),
  ]);
  return { schedules, assignments, exams };
}
async function accounts(db: Db, facultyIds: string[], departmentId: string) {
  return db.user.findMany({
    where: { OR: [{ facultyId: { in: facultyIds } }, { departmentAssignments: { some: { departmentId } } }] }, orderBy: { id: "asc" },
    select: { id: true, name: true, email: true, role: true, status: true, archivedAt: true, facultyId: true, sessionVersion: true,
      departmentAssignments: { orderBy: { id: "asc" }, select: { id: true, departmentId: true, acting: true, startsAt: true, endsAt: true } },
      programAssignments: { orderBy: { id: "asc" }, select: { id: true, programId: true, isActing: true, startDate: true, endDate: true } },
    },
  });
}

export async function previewCoicsFaculty(db: Db, source: RosterPerson[]) {
  const department = await db.department.findUniqueOrThrow({ where: { code: "COICS" } });
  const existing = await db.faculty.findMany();
  const plan = planCoicsFaculty(source, existing, department.id);
  const records = await teachingRecords(db, plan.archiveIds);
  return { department: department.name, create: plan.create.length, keep: plan.keepIds.length, archive: plan.archiveIds.length,
    profiles: plan.create.map((p) => ({ name: p.fullName, employeeId: p.employeeId, email: p.email, status: p.status, position: p.position })),
    preservedActiveClasses: records.schedules.filter((s) => s.status !== "ARCHIVED").length,
    preservedActiveAssignments: records.assignments.filter((a) => a.status === "ACTIVE").length,
    headAccess: "Existing accounts and department authority remain unchanged. Marvin is designated only until real contact details are supplied.",
  };
}

export async function replaceCoicsFaculty(db: PrismaClient, source: RosterPerson[]) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('department-head-authority'))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
    const department = await tx.department.findUniqueOrThrow({ where: { code: "COICS" } });
    const existing = await tx.faculty.findMany();
    const plan = planCoicsFaculty(source, existing, department.id);
    const oldIds = existing.filter((f) => f.departmentId === department.id).map((f) => f.id);
    const before = await teachingRecords(tx, oldIds);
    const usersBefore = await accounts(tx, oldIds, department.id);
    const original = await tx.faculty.findMany({ where: { departmentId: department.id }, include: { availability: true, roomPreferences: true }, orderBy: { id: "asc" } });
    const directory = resolve("uploads/faculty-backups");
    await mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = resolve(directory, `coics-${stamp}.json`);
    await writeFile(backupPath, JSON.stringify({ savedAt: new Date().toISOString(), department, source, faculty: original, accounts: usersBefore, ...before }, null, 2), { flag: "wx" });

    const importedIds = [...plan.keepIds];
    for (const person of plan.create) importedIds.push((await tx.faculty.create({ data: person })).id);
    // Deliberately archive faculty profiles only: the user explicitly deferred account/head-access changes.
    const archived = await tx.faculty.updateMany({ where: { id: { in: plan.archiveIds }, archivedAt: null }, data: {
      archivedAt: new Date(), archiveReason: "Replaced by the supplied COICS roster. Classes and assignments retained for reassignment; account access retained pending head handoff.",
    } });
    assert.deepEqual(await teachingRecords(tx, oldIds), before, "Teaching records must remain unchanged");
    assert.deepEqual(await accounts(tx, oldIds, department.id), usersBefore, "Account access and head authority must remain unchanged");
    const roster = await tx.faculty.findMany({ where: { departmentId: department.id, archivedAt: null }, orderBy: { fullName: "asc" }, include: { user: { select: { id: true } } } });
    assert.equal(roster.length, 16);
    assert.deepEqual(roster.map((f) => rosterName(f.fullName)).sort(), source.map((p) => rosterName(p.fullName)).sort());
    assert.equal(await tx.user.count({ where: { facultyId: { in: importedIds.filter((id) => !plan.keepIds.includes(id)) } } }), 0, "Temporary profiles must not create accounts");
    const result = { profiles: roster.length, created: plan.create.length, archived: archived.count, backupPath,
      preservedActiveClasses: before.schedules.filter((s) => s.status !== "ARCHIVED").length,
      preservedActiveAssignments: before.assignments.filter((a) => a.status === "ACTIVE").length,
      headAccessUnchanged: true, designatedHead: COICS_DESIGNATED_HEAD,
    };
    await tx.auditLog.create({ data: { action: "Replaced COICS faculty roster with supplied temporary profiles", entity: "Department", entityId: department.id, departmentId: department.id,
      reason: "User requested replacement while preserving teaching records and deferring head account access until real contact details are available.",
      oldValue: { facultyIds: plan.archiveIds }, newValue: { ...result, facultyIds: importedIds, newProfilesInactive: true, newAccountsCreated: 0 },
    } });
    const reassignment = before.schedules.filter((s) => s.status !== "ARCHIVED").map((s) => ({ type: "Schedule", id: s.id, semesterId: s.semesterId, sectionId: s.sectionId, subjectId: s.subjectId, facultyId: s.facultyId, status: s.status }));
    const assigned = before.assignments.filter((a) => a.status === "ACTIVE").map((a) => ({ type: "SubjectAssignment", id: a.id, semesterId: a.semesterId, sectionId: a.sectionId, subjectId: a.subjectId, facultyId: a.facultyId, status: a.status }));
    return { ...result, roster, reassignment: [...reassignment, ...assigned].filter((r) => plan.archiveIds.includes(r.facultyId)).map((r) => ({ ...r, oldFaculty: existing.find((f) => f.id === r.facultyId)!.fullName, targetFacultyId: "" })) };
  }, { maxWait: 10_000, timeout: 120_000, isolationLevel: "Serializable" });
}
