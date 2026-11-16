BEGIN;

-- Repair missing queue components for academically valid, active section assignments.
-- Existing components, remembered choices, assignments, and scheduled meetings are preserved.
INSERT INTO "SectionClassPlaceholder" ("id", "sectionId", "subjectId", "component", "createdAt")
SELECT 'assigned_queue_' || md5(s."id" || ':' || sub."id" || ':' || component.kind),
  s."id", sub."id", component.kind::"SubjectComponent", CURRENT_TIMESTAMP
FROM "SubjectAssignment" a
JOIN "Section" s ON s."id" = a."sectionId" AND s."archivedAt" IS NULL
JOIN "Subject" sub ON sub."id" = a."subjectId" AND sub."archivedAt" IS NULL
JOIN "Semester" t ON t."id" = a."semesterId" AND t."level" = sub."level" AND t."level" = s."level"
CROSS JOIN LATERAL (VALUES ('LECTURE', sub."lectureHours"), ('LABORATORY', sub."labHours")) component(kind, hours)
WHERE a."status" = 'ACTIVE' AND component.hours > 0
  AND (s."semesterId" = t."id" OR (s."semesterId" IS NULL AND s."level" <> 'COLLEGE'))
  AND (t."programId" IS NULL OR t."programId" = s."programId")
  AND (sub."semester" IS NULL OR sub."semester" = t."type")
  AND ((sub."level" = 'COLLEGE' AND (sub."yearLevel" IS NULL OR sub."yearLevel" = s."yearLevel"))
    OR (sub."level" <> 'COLLEGE' AND (sub."gradeLevel" IS NULL OR sub."gradeLevel" = s."gradeLevel")))
  AND (sub."programId" = s."programId"
    OR EXISTS (SELECT 1 FROM "_SharedSubjectPrograms" sp WHERE sp."B" = sub."id" AND sp."A" = s."programId")
    OR (sub."programId" IS NULL AND NOT EXISTS (SELECT 1 FROM "_SharedSubjectPrograms" sp WHERE sp."B" = sub."id")))
ON CONFLICT ("sectionId", "subjectId", "component") DO NOTHING;

COMMIT;
