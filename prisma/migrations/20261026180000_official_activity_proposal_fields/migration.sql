ALTER TABLE "ActivityProposal"
ADD COLUMN "preparedBy" TEXT,
ADD COLUMN "designation" TEXT;

ALTER TABLE "ActivityProposalRow"
ADD COLUMN "category" "ActivityType";
