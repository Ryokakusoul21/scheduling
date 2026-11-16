-- Department selectors share this table. Add the individual school departments
-- without changing existing college departments or historical BED assignments.
INSERT INTO "Department" ("id", "code", "name", "createdAt", "updatedAt")
VALUES
  ('granby_department_shs', 'SHS', 'Senior High School Department', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('granby_department_jhs', 'JHS', 'Junior High School Department', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('granby_department_elem', 'ELEM', 'Elementary Department', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('granby_department_pre_elem', 'PRE-ELEM', 'Pre-Elementary Department', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
