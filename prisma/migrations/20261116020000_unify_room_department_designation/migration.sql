-- The supplied room catalog identifies these school departments in room names.
-- Preserve IDs, schedules, and bookings while replacing the old BED grouping.
UPDATE "Room" room
SET "departmentId" = target."id", "updatedAt" = CURRENT_TIMESTAMP
FROM "Department" old, "Department" target
WHERE room."departmentId" = old."id" AND old."code" = 'BED'
  AND target."code" = CASE
    WHEN room."roomName" LIKE '%(Pre-elementary)' THEN 'PRE-ELEM'
    WHEN room."roomName" LIKE '%(Elementary)' THEN 'ELEM'
    WHEN room."roomName" LIKE '%(Junior High School)' THEN 'JHS'
    WHEN room."roomName" LIKE '%(Senior High School)' THEN 'SHS'
  END;

-- Ownership is now the designation. The legacy shared flag mirrors it.
UPDATE "Room"
SET "isGeneralShared" = ("departmentId" IS NULL), "updatedAt" = CURRENT_TIMESTAMP
WHERE "isGeneralShared" IS DISTINCT FROM ("departmentId" IS NULL);
