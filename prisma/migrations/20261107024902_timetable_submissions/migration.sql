-- CreateEnum
CREATE TYPE "TimetableSubmissionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'PUBLISHED', 'RETURNED', 'REJECTED');

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "submissionId" TEXT;

-- CreateTable
CREATE TABLE "TimetableSubmission" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TimetableSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "classCount" INTEGER NOT NULL,
    "overrideReason" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "TimetableSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableSubmission_departmentId_semesterId_idx" ON "TimetableSubmission"("departmentId", "semesterId");

-- CreateIndex
CREATE INDEX "TimetableSubmission_status_idx" ON "TimetableSubmission"("status");

-- CreateIndex
CREATE INDEX "Schedule_submissionId_idx" ON "Schedule"("submissionId");

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TimetableSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSubmission" ADD CONSTRAINT "TimetableSubmission_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSubmission" ADD CONSTRAINT "TimetableSubmission_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSubmission" ADD CONSTRAINT "TimetableSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSubmission" ADD CONSTRAINT "TimetableSubmission_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
