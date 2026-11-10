-- Legacy strand restrictions would otherwise hide all current basic-education
-- records from the department head. Preserve the assignment history and let
-- the existing department permissions govern the current offerings.
UPDATE "HeadProgramAssignment" assignment SET "endDate" = CURRENT_TIMESTAMP
FROM "Program" program
WHERE assignment."programId" = program."id" AND program."level" = 'SENIOR_HIGH'
  AND (assignment."endDate" IS NULL OR assignment."endDate" > CURRENT_TIMESTAMP);
