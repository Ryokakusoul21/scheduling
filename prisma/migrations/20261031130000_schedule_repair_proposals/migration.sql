CREATE TYPE "ProposalKind" AS ENUM ('WORKLOAD', 'SCHEDULE_REPAIR');

ALTER TABLE "WorkloadProposal" ADD COLUMN "kind" "ProposalKind" NOT NULL DEFAULT 'WORKLOAD',
ADD COLUMN "generatedAt" TIMESTAMP(3),
ADD COLUMN "options" JSONB,
ADD COLUMN "undoneAt" TIMESTAMP(3),
ADD COLUMN "undoneById" TEXT;

CREATE INDEX "WorkloadProposal_kind_status_idx" ON "WorkloadProposal"("kind", "status");
