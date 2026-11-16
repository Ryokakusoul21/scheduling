-- Employee IDs start with "GC-": rename the earlier "F-" IDs.
UPDATE "Faculty" SET "employeeId" = 'GC-' || substring("employeeId" from 3) WHERE "employeeId" LIKE 'F-%';
