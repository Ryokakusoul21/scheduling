-- CreateEnum
CREATE TYPE "AcademicLevel" AS ENUM ('ELEMENTARY', 'JUNIOR_HIGH', 'SENIOR_HIGH', 'COLLEGE');

-- CreateEnum
CREATE TYPE "GradeLevel" AS ENUM ('KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SemesterType" ADD VALUE 'QUARTER_1';
ALTER TYPE "SemesterType" ADD VALUE 'QUARTER_2';
ALTER TYPE "SemesterType" ADD VALUE 'QUARTER_3';
ALTER TYPE "SemesterType" ADD VALUE 'QUARTER_4';

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Program" DROP CONSTRAINT "Program_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "Section" DROP CONSTRAINT "Section_programId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_programId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_sectionId_fkey";

-- DropForeignKey
ALTER TABLE "Conflict" DROP CONSTRAINT "Conflict_scheduleId_fkey";

-- DropIndex
DROP INDEX "User_studentId_key";

-- DropIndex
DROP INDEX "Semester_academicYearId_type_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "studentId";

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "level" "AcademicLevel" NOT NULL DEFAULT 'COLLEGE',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "departmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Semester" ADD COLUMN     "level" "AcademicLevel" NOT NULL DEFAULT 'COLLEGE',
ADD COLUMN     "programId" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "gradeLevel" "GradeLevel",
ADD COLUMN     "level" "AcademicLevel" NOT NULL DEFAULT 'COLLEGE',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "gradeLevel" "GradeLevel",
ADD COLUMN     "level" "AcademicLevel" NOT NULL DEFAULT 'COLLEGE',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "yearLevel" DROP NOT NULL,
ALTER COLUMN "programId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Faculty" ADD COLUMN     "teachingLevels" "AcademicLevel"[] DEFAULT ARRAY['COLLEGE']::"AcademicLevel"[];

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "floorId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DailyStat" DROP COLUMN "totalStudents",
ADD COLUMN     "totalSections" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "Student";

-- DropTable
DROP TABLE "Conflict";

-- DropTable
DROP TABLE "SchedulingConstraint";

-- DropEnum
DROP TYPE "StudentStatus";

-- DropEnum
DROP TYPE "ConflictType";

-- DropEnum
DROP TYPE "ConflictSeverity";

-- DropEnum
DROP TYPE "ConflictStatus";

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Building_name_key" ON "Building"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_buildingId_name_key" ON "Floor"("buildingId", "name");

-- Data migration: turn the free-text Room.building into Building -> Floor rows.
-- Every existing building gets a single "Ground Floor"; rooms without a building
-- go to an "Unassigned" building so nothing is lost. Floors can be split later in the UI.
INSERT INTO "Building" ("id", "name", "updatedAt")
SELECT gen_random_uuid()::text, b.name, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT COALESCE(NULLIF(TRIM("building"), ''), 'Unassigned') AS name FROM "Room"
) b;

INSERT INTO "Floor" ("id", "buildingId", "name", "number", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'Ground Floor', 1, CURRENT_TIMESTAMP FROM "Building";

UPDATE "Room" r
SET "floorId" = f."id"
FROM "Building" b
JOIN "Floor" f ON f."buildingId" = b."id"
WHERE b."name" = COALESCE(NULLIF(TRIM(r."building"), ''), 'Unassigned');

ALTER TABLE "Room" DROP COLUMN "building";

-- Existing programs, sections and subjects are all College records.
-- CreateIndex
CREATE INDEX "Semester_academicYearId_level_idx" ON "Semester"("academicYearId", "level");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

