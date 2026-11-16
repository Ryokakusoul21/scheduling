import { PageHeader } from "@/components/ux/states";
import { prisma } from "@/lib/db/prisma";
import { can } from "@/lib/permissions/policy";
import { policyUserFromScope, type Scope } from "@/lib/permissions/scope";
import { assignableFaculty } from "@/lib/subjects/assignments";
import { assignmentWarnings } from "@/lib/subjects/assignment-rules";
import { formatRange } from "@/lib/scheduler/timetable";
import { AssignmentApprovalsWorkspace, type AssignmentProposalRow } from "./assignment-approvals-workspace";

export async function AssignmentApprovalsSection({ scope, embedded = false }: { scope: Scope; embedded?: boolean }) {
  const proposals = await prisma.subjectAssignmentProposal.findMany({
    where: scope.isAdmin ? {} : {
      OR: [
        { reviewDepartmentId: { in: scope.departmentIds } },
        { requestedById: scope.userId },
      ],
    },
    include: {
      subject: { select: { id: true, code: true, name: true, units: true, lectureHours: true, labHours: true } },
      faculty: { select: { id: true, fullName: true, status: true, archivedAt: true, department: { select: { name: true } } } },
      section: { select: { id: true, name: true } },
      semester: { select: { id: true, name: true, academicYear: { select: { name: true } } } },
      reviewDepartment: { select: { name: true } },
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });
  const pending = proposals.filter((proposal) => proposal.status === "PENDING");
  const assignments = pending.length ? await prisma.subjectAssignment.findMany({
    where: {
      status: "ACTIVE",
      OR: pending.flatMap((proposal) => [
        { subjectId: proposal.subjectId, sectionId: proposal.sectionId, semesterId: proposal.semesterId },
        { subjectId: proposal.subjectId, sectionId: null, semesterId: proposal.semesterId },
      ]),
    },
    select: { subjectId: true, sectionId: true, semesterId: true, faculty: { select: { fullName: true } } },
  }) : [];
  const currentBySlot = new Map(assignments.map((assignment) => [
    `${assignment.subjectId}|${assignment.sectionId ?? "*"}|${assignment.semesterId}`,
    assignment.faculty.fullName,
  ]));
  const termIds = [...new Set(pending.map((proposal) => proposal.semesterId))];
  const facultyIds = [...new Set(pending.map((proposal) => proposal.facultyId))];
  const sectionIds = [...new Set(pending.map((proposal) => proposal.sectionId))];
  const [pools, schedules] = await Promise.all([
    Promise.all(termIds.map(async (termId) => [termId, await assignableFaculty(termId)] as const)),
    termIds.length ? prisma.schedule.findMany({
      where: {
        semesterId: { in: termIds },
        status: { not: "ARCHIVED" },
        OR: [{ facultyId: { in: facultyIds } }, { sectionId: { in: sectionIds } }],
      },
      select: { id: true, semesterId: true, subjectId: true, sectionId: true, facultyId: true, dayOfWeek: true, startMin: true, endMin: true, subject: { select: { code: true } }, section: { select: { name: true } } },
    }) : [],
  ]);
  const poolByTerm = new Map(pools);
  const rows: AssignmentProposalRow[] = proposals.map((proposal) => ({
    id: proposal.id,
    status: proposal.status,
    subjectCode: proposal.subject.code,
    subjectName: proposal.subject.name,
    sectionName: proposal.section.name,
    termLabel: `${proposal.semester.name} ${proposal.semester.academicYear.name}`,
    facultyName: proposal.faculty.fullName,
    facultyDepartment: proposal.faculty.department?.name ?? "No department",
    reviewDepartment: proposal.reviewDepartment.name,
    requestedBy: proposal.requestedBy.name,
    reviewedBy: proposal.reviewedBy?.name ?? "",
    currentFaculty: currentBySlot.get(`${proposal.subjectId}|${proposal.sectionId}|${proposal.semesterId}`) ??
      currentBySlot.get(`${proposal.subjectId}|*|${proposal.semesterId}`) ?? null,
    decisionNote: proposal.decisionNote ?? "",
    createdAt: proposal.createdAt.toISOString(),
    reviewWarnings: proposal.status !== "PENDING" ? [] : (() => {
      const pool = poolByTerm.get(proposal.semesterId);
      if (!pool) return ["Workload data is unavailable for this term."];
      const faculty = pool.faculty.find((candidate) => candidate.id === proposal.facultyId);
      if (!faculty) return ["The proposed faculty member is no longer active."];
      const warnings = assignmentWarnings(faculty, [{
        code: proposal.subject.code,
        units: proposal.subject.units,
        lectureHours: proposal.subject.lectureHours,
        labHours: proposal.subject.labHours,
        departmentId: null,
        departmentName: null,
      }], pool.measure);
      const subjectClasses = schedules.filter((schedule) =>
        schedule.semesterId === proposal.semesterId && schedule.subjectId === proposal.subjectId && schedule.sectionId === proposal.sectionId,
      );
      const facultyClasses = schedules.filter((schedule) =>
        schedule.semesterId === proposal.semesterId && schedule.facultyId === proposal.facultyId,
      );
      for (const proposedClass of subjectClasses) {
        for (const facultyClass of facultyClasses) {
          if (proposedClass.id !== facultyClass.id && proposedClass.dayOfWeek === facultyClass.dayOfWeek &&
              proposedClass.startMin < facultyClass.endMin && facultyClass.startMin < proposedClass.endMin) {
            warnings.push(`${proposal.subject.code} overlaps ${facultyClass.subject.code} for ${facultyClass.section.name} on ${proposedClass.dayOfWeek.toLowerCase()} ${formatRange(facultyClass.startMin, facultyClass.endMin)}.`);
          }
        }
      }
      return [...new Set(warnings)];
    })(),
    canReview: can(policyUserFromScope(scope), "approve", {
      type: "subjectAssignmentProposal",
      departmentId: proposal.reviewDepartmentId,
      ownerUserId: proposal.requestedById,
    }),
  }));
  return (
    <section aria-label="Subject Assignment Approvals" className="space-y-4">
      {!embedded && <PageHeader
        title="Subject Assignment Approvals"
        description={scope.isAdmin ? "Review proposals across all faculty departments." : "Review proposals routed to your department based on the proposed faculty member."}
      />}
      <AssignmentApprovalsWorkspace rows={rows} />
    </section>
  );
}
