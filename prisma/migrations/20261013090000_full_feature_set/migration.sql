-- CreateEnum
CREATE TYPE "ExaminationType" AS ENUM ('PRELIMINARY', 'MIDTERM', 'FINAL', 'SPECIAL');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('SCHOOL_EVENT', 'HOLIDAY', 'CLASS_SUSPENSION');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UnavailabilityKind" AS ENUM ('FACULTY', 'ROOM');

-- CreateEnum
CREATE TYPE "UnavailabilityStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AdjustmentCause" AS ENUM ('ROOM_BOOKING', 'FACULTY_UNAVAILABLE', 'ROOM_UNAVAILABLE', 'CLASS_SUSPENSION');

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('MOVED', 'CANCELLED', 'MAKE_UP');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMINISTRATOR', 'HEAD_OF_DEPARTMENT', 'FACULTY');
-- Map old roles: Scheduler becomes Head of Department; Super Admin and Registrar become Administrator; students are deactivated.
UPDATE "User" SET "status" = 'INACTIVE' WHERE "role"::text = 'STUDENT';
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'SCHEDULER' THEN 'HEAD_OF_DEPARTMENT'
    WHEN 'FACULTY' THEN 'FACULTY'
    WHEN 'STUDENT' THEN 'FACULTY'
    ELSE 'ADMINISTRATOR'
  END
)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
COMMIT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "Examination" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "proctorId" TEXT NOT NULL,
    "type" "ExaminationType" NOT NULL DEFAULT 'MIDTERM',
    "date" DATE NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Examination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "sectionIds" TEXT[],
    "batchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomBooking" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bookedById" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "attendees" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unavailability" (
    "id" TEXT NOT NULL,
    "kind" "UnavailabilityKind" NOT NULL,
    "facultyId" TEXT,
    "roomId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "reason" TEXT NOT NULL,
    "status" "UnavailabilityStatus" NOT NULL DEFAULT 'PENDING',
    "reportedById" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjustmentBatch" (
    "id" TEXT NOT NULL,
    "cause" "AdjustmentCause" NOT NULL,
    "summary" TEXT NOT NULL,
    "createdById" TEXT,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjustmentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAdjustment" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "date" DATE NOT NULL,
    "newDate" DATE,
    "roomId" TEXT,
    "facultyId" TEXT,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkloadProposal" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "departmentId" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "items" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "narrative" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkloadProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentRecord" (
    "id" TEXT NOT NULL,
    "level" "AcademicLevel" NOT NULL,
    "programId" TEXT,
    "academicYear" TEXT NOT NULL,
    "termType" "SemesterType" NOT NULL,
    "enrolled" INTEGER NOT NULL,

    CONSTRAINT "EnrollmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Examination_date_idx" ON "Examination"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_batchId_key" ON "Activity"("batchId");

-- CreateIndex
CREATE INDEX "Activity_startDate_endDate_idx" ON "Activity"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "RoomBooking_batchId_key" ON "RoomBooking"("batchId");

-- CreateIndex
CREATE INDEX "RoomBooking_roomId_date_idx" ON "RoomBooking"("roomId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Unavailability_batchId_key" ON "Unavailability"("batchId");

-- CreateIndex
CREATE INDEX "ScheduleAdjustment_scheduleId_date_idx" ON "ScheduleAdjustment"("scheduleId", "date");

-- CreateIndex
CREATE INDEX "EnrollmentRecord_level_programId_idx" ON "EnrollmentRecord"("level", "programId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_proctorId_fkey" FOREIGN KEY ("proctorId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AdjustmentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AdjustmentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unavailability" ADD CONSTRAINT "Unavailability_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unavailability" ADD CONSTRAINT "Unavailability_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unavailability" ADD CONSTRAINT "Unavailability_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AdjustmentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAdjustment" ADD CONSTRAINT "ScheduleAdjustment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AdjustmentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAdjustment" ADD CONSTRAINT "ScheduleAdjustment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

