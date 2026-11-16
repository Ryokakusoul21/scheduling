BEGIN;

-- Keep the newest explicit teacher if historical data contains duplicate active slots.
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "semesterId", "sectionId", "subjectId" ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
  ) AS position
  FROM "SubjectAssignment" WHERE "status" = 'ACTIVE' AND "sectionId" IS NOT NULL
)
UPDATE "SubjectAssignment" SET "status" = 'ARCHIVED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

-- Expand legacy defaults into the sections that exist in their original term now.
-- Explicit section overrides win. Archived defaults remain available for audit/history.
WITH defaults AS (
  SELECT DISTINCT ON ("subjectId", "semesterId") * FROM "SubjectAssignment"
  WHERE "status" = 'ACTIVE' AND "sectionId" IS NULL
  ORDER BY "subjectId", "semesterId", "updatedAt" DESC, "createdAt" DESC, "id" DESC
)
INSERT INTO "SubjectAssignment" ("id", "subjectId", "facultyId", "sectionId", "semesterId", "status", "assignedById", "createdAt", "updatedAt")
SELECT 'offering_' || md5(a."id" || ':' || s."id"), a."subjectId", a."facultyId", s."id", a."semesterId", 'ACTIVE', a."assignedById", a."createdAt", CURRENT_TIMESTAMP
FROM defaults a
JOIN "Subject" sub ON sub."id" = a."subjectId" AND sub."archivedAt" IS NULL
JOIN "Semester" t ON t."id" = a."semesterId" AND t."level" = sub."level"
JOIN "Section" s ON s."archivedAt" IS NULL AND s."level" = sub."level"
  AND (s."semesterId" = t."id" OR (s."semesterId" IS NULL AND s."level" <> 'COLLEGE'))
WHERE (sub."semester" IS NULL OR sub."semester" = t."type")
  AND (t."programId" IS NULL OR t."programId" = s."programId")
  AND ((sub."level" = 'COLLEGE' AND (sub."yearLevel" IS NULL OR sub."yearLevel" = s."yearLevel"))
    OR (sub."level" <> 'COLLEGE' AND (sub."gradeLevel" IS NULL OR sub."gradeLevel" = s."gradeLevel")))
  AND (sub."programId" = s."programId"
    OR EXISTS (SELECT 1 FROM "_SharedSubjectPrograms" sp WHERE sp."B" = sub."id" AND sp."A" = s."programId")
    OR (sub."programId" IS NULL AND NOT EXISTS (SELECT 1 FROM "_SharedSubjectPrograms" sp WHERE sp."B" = sub."id")))
  AND (NOT EXISTS (SELECT 1 FROM "SectionClassPlaceholder" cp WHERE cp."sectionId" = s."id")
    OR EXISTS (SELECT 1 FROM "SectionClassPlaceholder" cp WHERE cp."sectionId" = s."id" AND cp."subjectId" = sub."id"))
  AND NOT EXISTS (SELECT 1 FROM "SubjectAssignment" old WHERE old."status" = 'ACTIVE' AND old."subjectId" = a."subjectId" AND old."semesterId" = a."semesterId" AND old."sectionId" = s."id");

UPDATE "SubjectAssignment" SET "status" = 'ARCHIVED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'ACTIVE' AND "sectionId" IS NULL;

-- The existing SubjectAssignment_active_key already enforces one active teacher per offering.
ALTER TABLE "SubjectAssignment" ADD CONSTRAINT "SubjectAssignment_active_requires_section"
  CHECK ("status" <> 'ACTIVE' OR "sectionId" IS NOT NULL);

COMMIT;
