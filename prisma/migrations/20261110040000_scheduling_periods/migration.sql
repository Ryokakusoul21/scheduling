CREATE TYPE "SchedulingPeriodKind" AS ENUM ('CLASS_TIMETABLE', 'EXAMINATION');
CREATE TYPE "SchedulingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "SchedulingPeriod" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "kind" "SchedulingPeriodKind" NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SchedulingPeriodStatus" NOT NULL DEFAULT 'CLOSED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchedulingPeriod_semesterId_kind_key" ON "SchedulingPeriod"("semesterId", "kind");
CREATE INDEX "SchedulingPeriod_status_startsAt_endsAt_idx" ON "SchedulingPeriod"("status", "startsAt", "endsAt");

ALTER TABLE "SchedulingPeriod" ADD CONSTRAINT "SchedulingPeriod_semesterId_fkey"
    FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;
