-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'EXAMINATION_WEEK';

-- AlterEnum
ALTER TYPE "ExaminationType" ADD VALUE 'SEMI_FINAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestType" ADD VALUE 'CROSS_DEPARTMENT';
ALTER TYPE "RequestType" ADD VALUE 'FACULTY_CHANGE';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "examinationType" "ExaminationType";

-- AlterTable
ALTER TABLE "Examination" ADD COLUMN     "batchId" TEXT;

-- AlterTable
ALTER TABLE "ScheduleRequest" ADD COLUMN     "targetDepartmentId" TEXT;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "ExamBatch" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "type" "ExaminationType" NOT NULL,
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Examination_batchId_idx" ON "Examination"("batchId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ExamBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamBatch" ADD CONSTRAINT "ExamBatch_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: sections and subjects take their program's department; basic-education records without a program
-- go to the Basic Education Department (code BED). College General Education subjects stay shared (null).
UPDATE "Section" s SET "departmentId" = p."departmentId" FROM "Program" p WHERE s."programId" = p."id";
UPDATE "Subject" s SET "departmentId" = p."departmentId" FROM "Program" p WHERE s."programId" = p."id";
UPDATE "Section" SET "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'BED') WHERE "departmentId" IS NULL AND "level" <> 'COLLEGE';
UPDATE "Subject" SET "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'BED') WHERE "departmentId" IS NULL AND "level" <> 'COLLEGE';
