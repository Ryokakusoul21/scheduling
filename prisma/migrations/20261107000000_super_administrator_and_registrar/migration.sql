-- Administrator becomes Registrar; Super Administrator owns accounts, settings, and audit logs.
ALTER TYPE "Role" RENAME VALUE 'ADMINISTRATOR' TO 'REGISTRAR';
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMINISTRATOR' BEFORE 'REGISTRAR';
