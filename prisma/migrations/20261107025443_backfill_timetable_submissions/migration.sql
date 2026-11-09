-- Classes already in review are grouped into one timetable submission per department and term.
WITH grouped AS (
  SELECT sec."departmentId", s."semesterId", COUNT(*)::int AS "classCount", MAX(s."updatedAt") AS "submittedAt"
  FROM "Schedule" s
  JOIN "Section" sec ON sec.id = s."sectionId"
  WHERE s.status = 'REVIEW' AND s."submissionId" IS NULL AND sec."departmentId" IS NOT NULL
  GROUP BY sec."departmentId", s."semesterId"
),
submitter AS (
  -- The department's Head of Department, or any Super Administrator when there is none.
  SELECT g."departmentId", g."semesterId", COALESCE(
    (SELECT u.id FROM "User" u JOIN "Faculty" f ON f.id = u."facultyId" WHERE u.role = 'HEAD_OF_DEPARTMENT' AND f."departmentId" = g."departmentId" ORDER BY u."createdAt" LIMIT 1),
    (SELECT u.id FROM "User" u WHERE u.role = 'SUPER_ADMINISTRATOR' ORDER BY u."createdAt" LIMIT 1)
  ) AS "userId"
  FROM grouped g
)
INSERT INTO "TimetableSubmission" ("id", "departmentId", "semesterId", "version", "status", "classCount", "submittedById", "submittedAt")
SELECT 'backfill-' || md5(g."departmentId" || g."semesterId"), g."departmentId", g."semesterId", 1, 'SUBMITTED', g."classCount", sb."userId", g."submittedAt"
FROM grouped g
JOIN submitter sb ON sb."departmentId" = g."departmentId" AND sb."semesterId" = g."semesterId"
WHERE sb."userId" IS NOT NULL;

UPDATE "Schedule" s
SET "submissionId" = 'backfill-' || md5(sec."departmentId" || s."semesterId")
FROM "Section" sec
WHERE sec.id = s."sectionId" AND s.status = 'REVIEW' AND s."submissionId" IS NULL
  AND EXISTS (SELECT 1 FROM "TimetableSubmission" t WHERE t.id = 'backfill-' || md5(sec."departmentId" || s."semesterId"));
