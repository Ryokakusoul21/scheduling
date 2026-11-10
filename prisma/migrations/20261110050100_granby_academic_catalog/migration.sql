-- A separate migration lets PostgreSQL commit new enum values before use.
-- Previously assumed Senior High terms are no longer active offerings.
UPDATE "Semester" SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "level" = 'SENIOR_HIGH' AND "isActive";

-- Copy the elementary quarter calendar for pre-elementary, preserving dates.
INSERT INTO "Semester" (
  "id", "academicYearId", "level", "programId", "type", "name",
  "startDate", "endDate", "isActive", "createdAt", "updatedAt"
)
SELECT 'pre_elementary_' || s."id", s."academicYearId", 'PRE_ELEMENTARY', NULL,
  s."type", s."name", s."startDate", s."endDate", s."isActive", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Semester" s
WHERE s."level" = 'ELEMENTARY'
  AND NOT EXISTS (
    SELECT 1 FROM "Semester" p
    WHERE p."level" = 'PRE_ELEMENTARY' AND p."academicYearId" = s."academicYearId"
      AND p."type" = s."type" AND p."programId" IS NULL
  );

UPDATE "Section" SET "level" = 'PRE_ELEMENTARY', "updatedAt" = CURRENT_TIMESTAMP
WHERE "gradeLevel" = 'KINDER' AND "level" = 'ELEMENTARY';
UPDATE "Subject" SET "level" = 'PRE_ELEMENTARY', "updatedAt" = CURRENT_TIMESTAMP
WHERE "gradeLevel" = 'KINDER' AND "level" = 'ELEMENTARY';

-- Move kindergarten schedules and assignments onto the matching quarter.
UPDATE "Schedule" row SET "semesterId" = target."id", "updatedAt" = CURRENT_TIMESTAMP
FROM "Section" section, "Semester" old, "Semester" target
WHERE row."sectionId" = section."id" AND section."level" = 'PRE_ELEMENTARY'
  AND row."semesterId" = old."id" AND old."level" = 'ELEMENTARY'
  AND target."level" = 'PRE_ELEMENTARY' AND target."academicYearId" = old."academicYearId"
  AND target."type" = old."type" AND target."programId" IS NULL;

UPDATE "SubjectAssignment" row SET "semesterId" = target."id", "updatedAt" = CURRENT_TIMESTAMP
FROM "Section" section, "Semester" old, "Semester" target
WHERE row."sectionId" = section."id" AND section."level" = 'PRE_ELEMENTARY'
  AND row."semesterId" = old."id" AND old."level" = 'ELEMENTARY'
  AND target."level" = 'PRE_ELEMENTARY' AND target."academicYearId" = old."academicYearId"
  AND target."type" = old."type" AND target."programId" IS NULL;

UPDATE "Examination" row SET "semesterId" = target."id", "updatedAt" = CURRENT_TIMESTAMP
FROM "Section" section, "Semester" old, "Semester" target
WHERE row."sectionId" = section."id" AND section."level" = 'PRE_ELEMENTARY'
  AND row."semesterId" = old."id" AND old."level" = 'ELEMENTARY'
  AND target."level" = 'PRE_ELEMENTARY' AND target."academicYearId" = old."academicYearId"
  AND target."type" = old."type" AND target."programId" IS NULL;

UPDATE "Section" section SET "semesterId" = target."id"
FROM "Semester" old, "Semester" target
WHERE section."level" = 'PRE_ELEMENTARY' AND section."semesterId" = old."id"
  AND old."level" = 'ELEMENTARY' AND target."level" = 'PRE_ELEMENTARY'
  AND target."academicYearId" = old."academicYearId" AND target."type" = old."type"
  AND target."programId" IS NULL;

UPDATE "Faculty" SET "teachingLevels" = array_append("teachingLevels", 'PRE_ELEMENTARY'::"AcademicLevel"),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE 'ELEMENTARY' = ANY("teachingLevels") AND NOT ('PRE_ELEMENTARY' = ANY("teachingLevels"));

-- Preserve program IDs and their relations while normalizing official codes.
UPDATE "Program" SET "code" = 'BSCRIM', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'BSCrim' AND NOT EXISTS (SELECT 1 FROM "Program" WHERE "code" = 'BSCRIM');

UPDATE "Program" p SET "name" = catalog.name, "sortOrder" = catalog.position,
  "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('BSIT', 'Bachelor of Science in Information Technology', 0),
  ('BSCS', 'Bachelor of Science in Computer Science', 1),
  ('BSCRIM', 'Bachelor of Science in Criminology', 2),
  ('BSISM', 'Bachelor of Science in Industrial Security Management', 3),
  ('BSBA', 'Bachelor of Science in Business Administration', 4),
  ('BSED', 'Bachelor of Secondary Education', 5),
  ('BEED', 'Bachelor of Elementary Education', 6),
  ('BSA', 'Bachelor of Science in Accountancy', 7),
  ('BSTM', 'Bachelor of Science in Tourism Management', 8)
) AS catalog(code, name, position)
WHERE p."code" = catalog.code AND p."level" = 'COLLEGE';
