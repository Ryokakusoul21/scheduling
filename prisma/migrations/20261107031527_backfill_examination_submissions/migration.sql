-- Examinations already in review are grouped into one submission per department, term, and examination period.
WITH grouped AS (
  SELECT sec."departmentId", e."semesterId", e.type, COUNT(*)::int AS "classCount", MAX(COALESCE(e."submittedAt", e."updatedAt")) AS "submittedAt"
  FROM "Examination" e
  JOIN "Section" sec ON sec.id = e."sectionId"
  WHERE e.status = 'REVIEW' AND e."submissionId" IS NULL AND sec."departmentId" IS NOT NULL
  GROUP BY sec."departmentId", e."semesterId", e.type
),
submitter AS (
  -- The department's Head of Department, or any Super Administrator when there is none.
  SELECT g."departmentId", g."semesterId", g.type, COALESCE(
    (SELECT u.id FROM "User" u JOIN "Faculty" f ON f.id = u."facultyId" WHERE u.role = 'HEAD_OF_DEPARTMENT' AND f."departmentId" = g."departmentId" ORDER BY u."createdAt" LIMIT 1),
    (SELECT u.id FROM "User" u WHERE u.role = 'SUPER_ADMINISTRATOR' ORDER BY u."createdAt" LIMIT 1)
  ) AS "userId"
  FROM grouped g
)
INSERT INTO "TimetableSubmission" ("id", "kind", "examType", "departmentId", "semesterId", "version", "status", "classCount", "submittedById", "submittedAt")
SELECT 'backfill-exam-' || md5(g."departmentId" || g."semesterId" || g.type::text), 'EXAMINATION', g.type, g."departmentId", g."semesterId", 1, 'SUBMITTED', g."classCount", sb."userId", g."submittedAt"
FROM grouped g
JOIN submitter sb ON sb."departmentId" = g."departmentId" AND sb."semesterId" = g."semesterId" AND sb.type = g.type
WHERE sb."userId" IS NOT NULL;

UPDATE "Examination" e
SET "submissionId" = 'backfill-exam-' || md5(sec."departmentId" || e."semesterId" || e.type::text)
FROM "Section" sec
WHERE sec.id = e."sectionId" AND e.status = 'REVIEW' AND e."submissionId" IS NULL
  AND EXISTS (SELECT 1 FROM "TimetableSubmission" t WHERE t.id = 'backfill-exam-' || md5(sec."departmentId" || e."semesterId" || e.type::text));
