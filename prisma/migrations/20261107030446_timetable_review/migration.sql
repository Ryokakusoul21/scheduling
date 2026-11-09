-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('CLASS', 'EXAMINATION');

-- AlterEnum
ALTER TYPE "TimetableSubmissionStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "Examination" ADD COLUMN     "submissionId" TEXT;

-- AlterTable
ALTER TABLE "TimetableSubmission" ADD COLUMN     "examType" "ExaminationType",
ADD COLUMN     "kind" "SubmissionKind" NOT NULL DEFAULT 'CLASS',
ADD COLUMN     "publishAt" TIMESTAMP(3),
ADD COLUMN     "snapshot" JSONB;

-- CreateTable
CREATE TABLE "TimetableComment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "rowId" TEXT,
    "rowLabel" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetableComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableComment_submissionId_idx" ON "TimetableComment"("submissionId");

-- CreateIndex
CREATE INDEX "Examination_submissionId_idx" ON "Examination"("submissionId");

-- AddForeignKey
ALTER TABLE "TimetableComment" ADD CONSTRAINT "TimetableComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TimetableSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableComment" ADD CONSTRAINT "TimetableComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TimetableSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
