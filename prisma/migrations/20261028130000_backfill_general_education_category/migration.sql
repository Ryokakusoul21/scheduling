-- College subjects without a program are General Education, which the category column defaulted to MAJOR.
UPDATE "Subject" SET "category" = 'MINOR' WHERE "level" = 'COLLEGE' AND "programId" IS NULL;
UPDATE "Subject" SET "semester" = 'FIRST' WHERE "level" = 'COLLEGE' AND "semester" IS NULL;
