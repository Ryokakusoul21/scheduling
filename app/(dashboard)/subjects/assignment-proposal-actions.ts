"use server";
import { AssignmentCurriculumError, syncAssignedCurriculum } from "@/lib/subjects/assignment-curriculum";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { handOverClasses } from "@/lib/subjects/hand-over";
import { prisma } from "@/lib/db/prisma";
import { can } from "@/lib/permissions/policy";
import { logBlocked } from "@/lib/permissions/department";
import { policyUserFromScope, requireScope } from "@/lib/permissions/scope";
import { notifyFaculty, notifyManagers, notifyUsers } from "@/lib/notify";
import { queueWorkloadCheck } from "@/lib/workload/auto";
import { planSchema, type PlanInput } from "@/lib/subjects/plan";
import { assignableFaculty } from "@/lib/subjects/assignments";
import { facultyAssignmentRoute } from "@/lib/subjects/assignment-access";
import { offeringMatches } from "@/lib/subjects/offerings";

type Result = { ok: true; warnings: string[]; changed: number } | { ok: false; error: string };
const decisionSchema = z.object({
  proposalId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "REJECTED" && !value.note) ctx.addIssue({ code: "custom", path: ["note"], message: "Add a reason before rejecting." });
});

class ProposalError extends Error {}

const slotKey = (subjectId: string, sectionId: string, semesterId: string) => `${subjectId}|${sectionId}|${semesterId}`;

/** Saves proposed assignments without activating them; the faculty department reviews each one. */
export async function createAssignmentProposalsAction(input: PlanInput): Promise<Result> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT");
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const subjectIds = [...new Set(parsed.data.subjectIds)];
  const changes = [...new Map(parsed.data.changes.map((change) => [change.sectionId ?? "", change])).values()];
  if (changes.some((change) => !change.sectionId || !change.facultyId)) {
    return { ok: false, error: "Choose a faculty member and a specific section for every proposal." };
  }
  const sectionIds = [...new Set(changes.map((change) => change.sectionId!))];
  const facultyIds = [...new Set(changes.map((change) => change.facultyId!))];

  const [subjects, term, sections, pool] = await Promise.all([
    prisma.subject.findMany({
      where: { id: { in: subjectIds }, archivedAt: null },
      select: { id: true, code: true, name: true, level: true, semester: true, departmentId: true, programId: true, yearLevel: true, gradeLevel: true, sharedPrograms: { select: { id: true } } },
    }),
    prisma.semester.findUnique({ where: { id: parsed.data.semesterId }, select: { id: true, name: true, type: true, level: true, programId: true, academicYear: { select: { name: true } } } }),
    prisma.section.findMany({
      where: { id: { in: sectionIds }, archivedAt: null },
      select: { id: true, name: true, level: true, semesterId: true, departmentId: true, programId: true, yearLevel: true, gradeLevel: true },
    }),
    assignableFaculty(parsed.data.semesterId),
  ]);
  if (subjects.length !== subjectIds.length) return { ok: false, error: "A subject was archived or removed. Refresh and try again." };
  if (!term) return { ok: false, error: "Choose a valid term." };
  if (sections.length !== sectionIds.length || sections.some((section) => section.semesterId && section.semesterId !== term.id)) {
    return { ok: false, error: "A chosen section does not belong to this term." };
  }
  if (subjects.some((subject) => subject.level !== term.level || (subject.semester && subject.semester !== term.type)) ||
      sections.some((section) => section.level !== term.level)) {
    return { ok: false, error: "Subjects, sections, and the term must belong to the same academic level and semester." };
  }

  const policyUser = policyUserFromScope(scope);
  const invalidSection = sections.find((section) => !can(policyUser, "edit", {
    type: "section", id: section.id, departmentId: section.departmentId, programId: section.programId,
  }) || !can(policyUser, "submit", {
    type: "subjectAssignmentProposal", departmentId: section.departmentId, programId: section.programId,
  }));
  if (invalidSection) {
    await logBlocked(scope, `propose subject assignment for section ${invalidSection.name}`, "SubjectAssignmentProposal", invalidSection.id);
    return { ok: false, error: "You can propose assignments only for sections in your department and program scope." };
  }

  const invalidSubject = subjects.find((subject) => sections.some((section) => !offeringMatches({ ...subject, sharedProgramIds: subject.sharedPrograms.map((p) => p.id) }, section, term)));
  if (invalidSubject) {
    await logBlocked(scope, `propose assignment for subject ${invalidSubject.code}`, "SubjectAssignmentProposal", invalidSubject.id);
    return { ok: false, error: "Only shared subjects in your section's curriculum can be proposed through this approval flow." };
  }
  const people = new Map(pool.faculty.map((faculty) => [faculty.id, faculty]));
  if (facultyIds.some((id) => !people.has(id))) return { ok: false, error: "A chosen faculty member is no longer active." };
  if (facultyIds.some((id) => !people.get(id)?.departmentId)) {
    return { ok: false, error: "The proposed faculty member must belong to a department for review routing." };
  }
  if (facultyIds.some((id) => facultyAssignmentRoute(policyUser, people.get(id)!.departmentId) !== "APPROVAL")) return { ok: false, error: "Faculty in your own department can be assigned directly through Assign faculty." };

  const active = await prisma.subjectAssignment.findMany({
    where: { status: "ACTIVE", semesterId: term.id, subjectId: { in: subjectIds }, sectionId: { in: sectionIds } },
    select: { subjectId: true, sectionId: true, facultyId: true },
  });
  const pending = await prisma.subjectAssignmentProposal.findMany({
    where: { status: "PENDING", semesterId: term.id, subjectId: { in: subjectIds }, sectionId: { in: sectionIds } },
    select: { subjectId: true, sectionId: true },
  });
  const existingBySlot = new Map(active.map((assignment) => [slotKey(assignment.subjectId, assignment.sectionId!, term.id), assignment]));
  const pendingSlots = new Set(pending.map((proposal) => slotKey(proposal.subjectId, proposal.sectionId, term.id)));
  const proposals = subjects.flatMap((subject) => changes.map((change) => ({
    subject,
    section: sections.find((section) => section.id === change.sectionId)!,
    faculty: people.get(change.facultyId!)!,
  }))).filter(({ subject, section, faculty }) =>
    existingBySlot.get(slotKey(subject.id, section.id, term.id))?.facultyId !== faculty.id,
  );
  if (!proposals.length) return { ok: false, error: "The proposed faculty member already holds every selected assignment." };
  if (proposals.some(({ subject, section }) => pendingSlots.has(slotKey(subject.id, section.id, term.id)))) {
    return { ok: false, error: "A pending proposal already exists for one of these subject sections." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
      await tx.subjectAssignmentProposal.createMany({
        data: proposals.map(({ subject, section, faculty }) => ({
          subjectId: subject.id,
          facultyId: faculty.id,
          sectionId: section.id,
          semesterId: term.id,
          reviewDepartmentId: faculty.departmentId!,
          requestedById: scope.userId,
        })),
      });
      await tx.auditLog.createMany({
        data: proposals.map(({ subject, section, faculty }) => ({
          userId: scope.userId,
          role: scope.role,
          departmentId: section.departmentId,
          entity: "SubjectAssignmentProposal",
          entityId: subject.id,
          action: `Proposed ${subject.code} for ${faculty.name} in section ${section.name}`,
          newValue: { subjectId: subject.id, facultyId: faculty.id, sectionId: section.id, semesterId: term.id },
        })),
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "A pending proposal already exists for one of these subject sections." };
    }
    throw error;
  }

  const messages = new Map<string, string[]>();
  for (const { subject, section, faculty } of proposals) {
    messages.set(faculty.departmentId!, [
      ...(messages.get(faculty.departmentId!) ?? []),
      `${subject.code} for ${section.name} is proposed for ${faculty.name}.`,
    ]);
  }
  for (const [departmentId, lines] of messages) {
    await notifyManagers(departmentId, {
      title: "Subject assignment needs review",
      message: lines.join(" "),
      link: "/assignment-approvals",
    });
  }
  await notifyUsers([scope.userId], {
    title: "Subject assignment proposal submitted",
    message: `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} sent to the proposed faculty member's department for review.`,
    link: "/assignment-approvals",
  });

  revalidatePath("/subjects");
  revalidatePath("/assignment-approvals");
  revalidatePath("/admin/review-center");
  return { ok: true, warnings: [], changed: proposals.length };
}

/** Approves or rejects a pending proposal, routing Head of Department decisions by faculty home department. */
export async function reviewAssignmentProposalAction(input: z.input<typeof decisionSchema>): Promise<Result> {
  const scope = await requireScope("HEAD_OF_DEPARTMENT", "REGISTRAR", "SUPER_ADMINISTRATOR");
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the decision and try again." };
  const action = parsed.data.decision === "APPROVED" ? "approve" : "reject";
  const accessTarget = await prisma.subjectAssignmentProposal.findUnique({
    where: { id: parsed.data.proposalId },
    select: { status: true, reviewDepartmentId: true, requestedById: true },
  });
  if (!accessTarget || accessTarget.status !== "PENDING") return { ok: false, error: "This proposal is no longer pending." };
  if (!can(policyUserFromScope(scope), action, {
    type: "subjectAssignmentProposal",
    departmentId: accessTarget.reviewDepartmentId,
    ownerUserId: accessTarget.requestedById,
  })) {
    await logBlocked(scope, `${action} subject assignment proposal`, "SubjectAssignmentProposal", parsed.data.proposalId);
    return { ok: false, error: "You cannot review proposals for this faculty department." };
  }

  let assignedFacultyId: string | null = null;
  let previousFacultyId: string | null = null;
  let requestedById: string | null = null;
  let departmentId: string | null = null;
  let subjectCode = "";
  let subjectId = "";
  let sectionId = "";
  let semesterId = "";
  let sectionName = "";
  let termName = "";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(90812026)`;
      const proposal = await tx.subjectAssignmentProposal.findUnique({
        where: { id: parsed.data.proposalId },
        include: {
          subject: { select: { id: true, code: true, level: true, semester: true, archivedAt: true, programId: true, yearLevel: true, gradeLevel: true, sharedPrograms: { select: { id: true } } } },
          faculty: { select: { id: true, fullName: true, departmentId: true, status: true, archivedAt: true, teachingLevels: true } },
          section: { select: { id: true, name: true, level: true, semesterId: true, departmentId: true, programId: true, archivedAt: true, yearLevel: true, gradeLevel: true } },
          semester: { select: { id: true, name: true, type: true, level: true, programId: true, academicYear: { select: { name: true } } } },
          requestedBy: { select: { id: true } },
        },
      });
      if (!proposal || proposal.status !== "PENDING") throw new ProposalError("This proposal is no longer pending.");
      if (!can(policyUserFromScope(scope), action, { type: "subjectAssignmentProposal", departmentId: proposal.reviewDepartmentId, ownerUserId: proposal.requestedById })) throw new ProposalError("You cannot review proposals for this faculty department.");

      if (parsed.data.decision === "APPROVED") {
        if (proposal.subject.archivedAt || proposal.section.archivedAt ||
            proposal.section.level !== proposal.semester.level || proposal.subject.level !== proposal.semester.level ||
            (proposal.subject.semester && proposal.subject.semester !== proposal.semester.type) ||
            (proposal.section.semesterId && proposal.section.semesterId !== proposal.semesterId)) {
          throw new ProposalError("The subject, section, or term changed. Submit a new proposal.");
        }
        if (!offeringMatches({ ...proposal.subject, sharedProgramIds: proposal.subject.sharedPrograms.map((p) => p.id) }, proposal.section, proposal.semester)) throw new ProposalError("The subject no longer belongs to this section's course, year, or semester. Submit a new proposal.");
        if (proposal.faculty.status !== "ACTIVE" || proposal.faculty.archivedAt ||
            proposal.faculty.departmentId !== proposal.reviewDepartmentId ||
            !proposal.faculty.teachingLevels.includes(proposal.semester.level)) {
          throw new ProposalError("The proposed faculty member is no longer eligible. Submit a new proposal.");
        }
      }

      const previous = parsed.data.decision === "APPROVED"
        ? await tx.subjectAssignment.findFirst({
            where: { subjectId: proposal.subjectId, sectionId: proposal.sectionId, semesterId: proposal.semesterId, status: "ACTIVE" },
            select: { id: true, facultyId: true },
          })
        : null;
      const updated = await tx.subjectAssignmentProposal.updateMany({
        where: { id: proposal.id, status: "PENDING" },
        data: {
          status: parsed.data.decision,
          reviewedById: scope.userId,
          decisionNote: parsed.data.note || null,
          decidedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new ProposalError("This proposal was already reviewed.");

      if (parsed.data.decision === "APPROVED") {
        if (previous) await tx.subjectAssignment.update({ where: { id: previous.id }, data: { status: "ARCHIVED" } });
        await tx.subjectAssignment.create({
          data: {
            subjectId: proposal.subjectId,
            facultyId: proposal.facultyId,
            sectionId: proposal.sectionId,
            semesterId: proposal.semesterId,
            assignedById: proposal.requestedById,
          },
        });
        await handOverClasses(tx, [{ subjectId: proposal.subjectId, sectionId: proposal.sectionId, semesterId: proposal.semesterId, facultyId: proposal.facultyId }]);
        await tx.auditLog.create({
          data: {
            userId: scope.userId,
            role: scope.role,
            departmentId: proposal.reviewDepartmentId,
            entity: "SubjectAssignment",
            entityId: proposal.subjectId,
            action: `Approved assignment of ${proposal.subject.code} to ${proposal.faculty.fullName} for ${proposal.section.name}`,
            oldValue: previous ? { facultyId: previous.facultyId } : undefined,
            newValue: { facultyId: proposal.facultyId, sectionId: proposal.sectionId, semesterId: proposal.semesterId },
            reason: parsed.data.note || undefined,
          },
        });
        await syncAssignedCurriculum(tx, [{ subjectId: proposal.subjectId, sectionId: proposal.sectionId, semesterId: proposal.semesterId }]);
      }

      await tx.auditLog.create({
        data: {
          userId: scope.userId,
          role: scope.role,
          departmentId: proposal.reviewDepartmentId,
          entity: "SubjectAssignmentProposal",
          entityId: proposal.id,
          action: `${parsed.data.decision === "APPROVED" ? "Approved" : "Rejected"} assignment proposal for ${proposal.subject.code}`,
          oldValue: { status: "PENDING" },
          newValue: { status: parsed.data.decision, decisionNote: parsed.data.note || null },
          reason: parsed.data.note || undefined,
        },
      });

      requestedById = proposal.requestedById;
      assignedFacultyId = parsed.data.decision === "APPROVED" ? proposal.facultyId : null;
      previousFacultyId = previous?.facultyId ?? null;
      departmentId = proposal.reviewDepartmentId;
      subjectCode = proposal.subject.code;
      subjectId = proposal.subjectId;
      sectionId = proposal.sectionId;
      semesterId = proposal.semesterId;
      sectionName = proposal.section.name;
      termName = `${proposal.semester.name} ${proposal.semester.academicYear.name}`;
    });
  } catch (error) {
    if (error instanceof ProposalError || error instanceof AssignmentCurriculumError) return { ok: false, error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "An active assignment already exists for this section. Refresh and review the current assignment." };
    }
    throw error;
  }

  const approved = parsed.data.decision === "APPROVED";
  await notifyUsers(requestedById ? [requestedById] : [], {
    title: `Subject assignment ${approved ? "approved" : "rejected"}`,
    message: approved
      ? `${subjectCode} for ${sectionName} was assigned after department approval.`
      : `${subjectCode} for ${sectionName} was rejected${parsed.data.note ? `: ${parsed.data.note}` : "."}`,
    link: approved ? "/my-subjects" : "/assignment-approvals",
    departmentId,
  });
  if (assignedFacultyId) {
    await notifyFaculty([assignedFacultyId], {
      title: "You were assigned a subject",
      message: `You are assigned to teach ${subjectCode} for ${sectionName} in ${termName}.`,
      link: "/my-subjects",
    });
  }
  if (previousFacultyId && assignedFacultyId && previousFacultyId !== assignedFacultyId) {
    await notifyFaculty([previousFacultyId], {
      title: "Subject assignment updated",
      message: `${subjectCode} for ${sectionName} is now assigned to another faculty member.`,
      link: "/my-subjects",
    });
  }
  if (approved) queueWorkloadCheck("Subject assignment approved", scope.userId);

  const staleMeetings = approved && assignedFacultyId ? await prisma.schedule.count({
    where: { subjectId, sectionId, semesterId, status: { not: "ARCHIVED" }, facultyId: { not: assignedFacultyId } },
  }) : 0;
  const warnings = staleMeetings
    ? [`${staleMeetings} scheduled meeting${staleMeetings === 1 ? " is" : "s are"} still assigned to the previous faculty. Update ${staleMeetings === 1 ? "it" : "them"} in the Scheduler.`]
    : [];
  revalidatePath("/subjects");
  revalidatePath("/assignment-approvals");
  revalidatePath("/admin/review-center");
  revalidatePath("/my-subjects");
  revalidatePath("/scheduler");
  revalidatePath("/workload");
  return { ok: true, warnings, changed: approved ? 1 : 0 };
}
