-- CreateEnum
CREATE TYPE "ActivityProposalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ActivityProposalRowStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "ActivityProposal" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "level" "AcademicLevel" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ActivityProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "examBatchId" TEXT,

    CONSTRAINT "ActivityProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityProposalRow" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "location" TEXT,
    "level" "AcademicLevel",
    "status" "ActivityProposalRowStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "activityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityProposalRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityProposal_status_departmentId_idx" ON "ActivityProposal"("status", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityProposal_semesterId_departmentId_level_version_key" ON "ActivityProposal"("semesterId", "departmentId", "level", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityProposalRow_activityId_key" ON "ActivityProposalRow"("activityId");

-- CreateIndex
CREATE INDEX "ActivityProposalRow_proposalId_sortOrder_idx" ON "ActivityProposalRow"("proposalId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ActivityProposal" ADD CONSTRAINT "ActivityProposal_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProposal" ADD CONSTRAINT "ActivityProposal_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProposal" ADD CONSTRAINT "ActivityProposal_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ActivityProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProposal" ADD CONSTRAINT "ActivityProposal_examBatchId_fkey" FOREIGN KEY ("examBatchId") REFERENCES "ExamBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProposalRow" ADD CONSTRAINT "ActivityProposalRow_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ActivityProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
