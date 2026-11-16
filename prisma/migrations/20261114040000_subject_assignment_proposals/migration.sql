CREATE TYPE "SubjectAssignmentProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "SubjectAssignmentProposal" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "reviewDepartmentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "status" "SubjectAssignmentProposalStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectAssignmentProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubjectAssignmentProposal_reviewDepartmentId_status_createdAt_idx"
    ON "SubjectAssignmentProposal"("reviewDepartmentId", "status", "createdAt");
CREATE INDEX "SubjectAssignmentProposal_requestedById_idx"
    ON "SubjectAssignmentProposal"("requestedById");
CREATE INDEX "SubjectAssignmentProposal_facultyId_idx"
    ON "SubjectAssignmentProposal"("facultyId");
CREATE UNIQUE INDEX "SubjectAssignmentProposal_pending_key"
    ON "SubjectAssignmentProposal"("subjectId", "sectionId", "semesterId")
    WHERE "status" = 'PENDING';

ALTER TABLE "SubjectAssignmentProposal"
    ADD CONSTRAINT "SubjectAssignmentProposal_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignmentProposal"
    ADD CONSTRAINT "SubjectAssignmentProposal_facultyId_fkey"
    FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignmentProposal"
    ADD CONSTRAINT "SubjectAssignmentProposal_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignmentProposal"
    ADD CONSTRAINT "SubjectAssignmentProposal_semesterId_fkey"
    FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignmentProposal"
    ADD CONSTRAINT "SubjectAssignmentProposal_reviewDepartmentId_fkey"
    FOREIGN KEY ("reviewDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignmentProposal"
    ADD CONSTRAINT "SubjectAssignmentProposal_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectAssignmentProposal"
    ADD CONSTRAINT "SubjectAssignmentProposal_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
