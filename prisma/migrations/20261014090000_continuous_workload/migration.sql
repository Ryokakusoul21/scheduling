-- CreateEnum
CREATE TYPE "FixMode" AS ENUM ('AUTOMATIC', 'APPROVED');

-- AlterEnum
ALTER TYPE "ProposalStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "WorkloadProposal" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WorkloadFix" (
    "id" TEXT NOT NULL,
    "mode" "FixMode" NOT NULL,
    "proposalId" TEXT,
    "trigger" TEXT NOT NULL,
    "assignmentKey" TEXT NOT NULL,
    "scheduleIds" TEXT[],
    "label" TEXT NOT NULL,
    "fromFacultyId" TEXT NOT NULL,
    "toFacultyId" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fromBefore" DOUBLE PRECISION NOT NULL,
    "fromAfter" DOUBLE PRECISION NOT NULL,
    "toBefore" DOUBLE PRECISION NOT NULL,
    "toAfter" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "appliedById" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,

    CONSTRAINT "WorkloadFix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkloadFix_appliedAt_idx" ON "WorkloadFix"("appliedAt");

