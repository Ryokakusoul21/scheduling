-- Multi-department and time-bounded acting assignments.
CREATE TABLE "UserDepartmentAssignment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "acting" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDepartmentAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserDepartmentAssignment_userId_departmentId_key" ON "UserDepartmentAssignment"("userId", "departmentId");
CREATE INDEX "UserDepartmentAssignment_departmentId_idx" ON "UserDepartmentAssignment"("departmentId");
CREATE INDEX "UserDepartmentAssignment_userId_startsAt_endsAt_idx" ON "UserDepartmentAssignment"("userId", "startsAt", "endsAt");
ALTER TABLE "UserDepartmentAssignment" ADD CONSTRAINT "UserDepartmentAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDepartmentAssignment" ADD CONSTRAINT "UserDepartmentAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the current single faculty department as the initial permanent assignment.
INSERT INTO "UserDepartmentAssignment" ("id", "userId", "departmentId", "acting")
SELECT 'uda_' || md5(u."id" || ':' || f."departmentId"), u."id", f."departmentId", false
FROM "User" u
JOIN "Faculty" f ON f."id" = u."facultyId"
WHERE u."role" = 'HEAD_OF_DEPARTMENT' AND f."departmentId" IS NOT NULL
ON CONFLICT ("userId", "departmentId") DO NOTHING;

-- Ownership snapshots are nullable for a safe rollout; the report script identifies anything not backfilled.
ALTER TABLE "Schedule" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Examination" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "RoomBooking" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "AdjustmentBatch" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "ScheduleAdjustment" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "WorkloadFix" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "ScheduleRequest" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "role" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "reason" TEXT;

UPDATE "Schedule" s SET "departmentId" = sec."departmentId" FROM "Section" sec WHERE sec."id" = s."sectionId";
UPDATE "Examination" e SET "departmentId" = sec."departmentId" FROM "Section" sec WHERE sec."id" = e."sectionId";
UPDATE "RoomBooking" b SET "departmentId" = f."departmentId" FROM "User" u JOIN "Faculty" f ON f."id" = u."facultyId" WHERE u."id" = b."bookedById";
UPDATE "ScheduleAdjustment" a SET "departmentId" = s."departmentId" FROM "Schedule" s WHERE s."id" = a."scheduleId";
UPDATE "AdjustmentBatch" b SET "departmentId" = a."departmentId" FROM "ScheduleAdjustment" a WHERE a."batchId" = b."id" AND b."departmentId" IS NULL;
UPDATE "AdjustmentBatch" b SET "departmentId" = act."departmentId" FROM "Activity" act WHERE act."batchId" = b."id" AND b."departmentId" IS NULL;
UPDATE "WorkloadFix" w SET "departmentId" = p."departmentId" FROM "WorkloadProposal" p WHERE p."id" = w."proposalId";
UPDATE "ScheduleRequest" r SET "departmentId" = s."departmentId" FROM "Schedule" s WHERE s."id" = r."scheduleId";
UPDATE "ScheduleRequest" r SET "departmentId" = f."departmentId" FROM "User" u JOIN "Faculty" f ON f."id" = u."facultyId" WHERE u."id" = r."requestedById" AND r."departmentId" IS NULL;
UPDATE "Notification" n SET "departmentId" = f."departmentId" FROM "User" u JOIN "Faculty" f ON f."id" = u."facultyId" WHERE u."id" = n."userId";
UPDATE "AuditLog" a SET "role" = u."role"::text, "departmentId" = f."departmentId" FROM "User" u LEFT JOIN "Faculty" f ON f."id" = u."facultyId" WHERE u."id" = a."userId";

CREATE INDEX "Schedule_departmentId_idx" ON "Schedule"("departmentId");
CREATE INDEX "Examination_departmentId_idx" ON "Examination"("departmentId");
CREATE INDEX "RoomBooking_departmentId_idx" ON "RoomBooking"("departmentId");
CREATE INDEX "ScheduleAdjustment_departmentId_idx" ON "ScheduleAdjustment"("departmentId");
CREATE INDEX "WorkloadFix_departmentId_idx" ON "WorkloadFix"("departmentId");
CREATE INDEX "ScheduleRequest_departmentId_idx" ON "ScheduleRequest"("departmentId");
CREATE INDEX "Notification_departmentId_idx" ON "Notification"("departmentId");
CREATE INDEX "AuditLog_departmentId_idx" ON "AuditLog"("departmentId");
