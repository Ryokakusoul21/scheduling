CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME');

ALTER TABLE "Faculty" ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN "dayOff" "DayOfWeek";
