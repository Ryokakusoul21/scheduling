/*
  Warnings:

  - You are about to drop the column `examBatchId` on the `ActivityProposal` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ActivityProposal" DROP CONSTRAINT "ActivityProposal_examBatchId_fkey";

-- AlterTable
ALTER TABLE "ActivityProposal" DROP COLUMN "examBatchId";

-- AlterTable
ALTER TABLE "Examination" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SectionClassPlaceholder" ADD COLUMN     "preferredFacultyId" TEXT,
ADD COLUMN     "rememberedFacultyId" TEXT,
ADD COLUMN     "rememberedRoomId" TEXT;

-- AlterTable
ALTER TABLE "_SharedSubjectPrograms" ADD CONSTRAINT "_SharedSubjectPrograms_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_SharedSubjectPrograms_AB_unique";

-- CreateTable
CREATE TABLE "HeadProgramAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "isActing" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeadProgramAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeadProgramAssignment_programId_idx" ON "HeadProgramAssignment"("programId");

-- CreateIndex
CREATE INDEX "HeadProgramAssignment_userId_startDate_endDate_idx" ON "HeadProgramAssignment"("userId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "HeadProgramAssignment_userId_programId_key" ON "HeadProgramAssignment"("userId", "programId");

-- AddForeignKey
ALTER TABLE "HeadProgramAssignment" ADD CONSTRAINT "HeadProgramAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadProgramAssignment" ADD CONSTRAINT "HeadProgramAssignment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
