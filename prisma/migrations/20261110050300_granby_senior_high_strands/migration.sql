-- Add the school's supplied SHS catalog without changing the college or
-- pre-elementary records, or deleting historical program relationships.
INSERT INTO "Program" ("id", "code", "name", "level", "sortOrder", "departmentId", "createdAt", "updatedAt")
SELECT 'granby_shs_' || lower(catalog.code), catalog.code, catalog.name,
  'SENIOR_HIGH', catalog.position, department."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('STEM', 'Science, Technology, Engineering and Mathematics', 0),
  ('ABM', 'Accountancy, Business and Management', 1),
  ('HUMSS', 'Humanities and Social Sciences', 2),
  ('GAS', 'General Academic Strand', 3),
  ('ICT', 'Information and Communications Technology', 4),
  ('TVL', 'Technical-Vocational-Livelihood', 5)
) AS catalog(code, name, position)
LEFT JOIN "Department" department ON department."code" = 'BED'
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "level" = EXCLUDED."level", "sortOrder" = EXCLUDED."sortOrder",
  "departmentId" = COALESCE("Program"."departmentId", EXCLUDED."departmentId"), "updatedAt" = CURRENT_TIMESTAMP;

-- Use the existing basic-education quarter calendar for SHS, including its
-- active quarter. Existing term IDs and their schedules remain intact.
INSERT INTO "Semester" (
  "id", "academicYearId", "level", "programId", "type", "name",
  "startDate", "endDate", "isActive", "createdAt", "updatedAt"
)
SELECT 'granby_shs_' || basic."id", basic."academicYearId", 'SENIOR_HIGH', NULL,
  basic."type", basic."name", basic."startDate", basic."endDate", basic."isActive", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Semester" basic
WHERE basic."level" = 'ELEMENTARY' AND basic."programId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Semester" shs
    WHERE shs."level" = 'SENIOR_HIGH' AND shs."academicYearId" = basic."academicYearId"
      AND shs."type" = basic."type" AND shs."programId" IS NULL
  );

UPDATE "Semester" shs SET "isActive" = basic."isActive", "updatedAt" = CURRENT_TIMESTAMP
FROM "Semester" basic
WHERE shs."level" = 'SENIOR_HIGH' AND shs."programId" IS NULL
  AND basic."level" = 'ELEMENTARY' AND basic."programId" IS NULL
  AND shs."academicYearId" = basic."academicYearId" AND shs."type" = basic."type";
