CREATE TYPE "ProposalItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

ALTER TABLE "WorkloadProposal" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "basis" TEXT;

CREATE TABLE "WorkloadProposalItem" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "move" JSONB NOT NULL,
    "fromFacultyId" TEXT NOT NULL,
    "toFacultyId" TEXT NOT NULL,
    "fromDepartmentId" TEXT,
    "toDepartmentId" TEXT,
    "status" "ProposalItemStatus" NOT NULL DEFAULT 'PENDING',
    "fromApprovedById" TEXT,
    "toApprovedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "edited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkloadProposalItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkloadProposalItem_proposalId_idx" ON "WorkloadProposalItem"("proposalId");

ALTER TABLE "WorkloadProposalItem" ADD CONSTRAINT "WorkloadProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "WorkloadProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pending workload proposals kept their moves as JSON only; the next check regenerates them as rows.
UPDATE "WorkloadProposal" SET "status" = 'SUPERSEDED' WHERE "kind" = 'WORKLOAD' AND "status" = 'PENDING';
