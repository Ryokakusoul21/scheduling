-- CreateEnum
CREATE TYPE "SuspensionStatus" AS ENUM ('ACTIVE', 'LIFTED');

-- CreateTable
CREATE TABLE "ClassSuspension" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "sectionIds" TEXT[],
    "level" "AcademicLevel",
    "departmentId" TEXT,
    "status" "SuspensionStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedById" TEXT NOT NULL,
    "issuedRole" "Role" NOT NULL,
    "liftedById" TEXT,
    "liftedAt" TIMESTAMP(3),
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSuspension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassSuspension_batchId_key" ON "ClassSuspension"("batchId");

-- CreateIndex
CREATE INDEX "ClassSuspension_startDate_endDate_idx" ON "ClassSuspension"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "ClassSuspension_departmentId_status_idx" ON "ClassSuspension"("departmentId", "status");

-- AddForeignKey
ALTER TABLE "ClassSuspension" ADD CONSTRAINT "ClassSuspension_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSuspension" ADD CONSTRAINT "ClassSuspension_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSuspension" ADD CONSTRAINT "ClassSuspension_liftedById_fkey" FOREIGN KEY ("liftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSuspension" ADD CONSTRAINT "ClassSuspension_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AdjustmentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
